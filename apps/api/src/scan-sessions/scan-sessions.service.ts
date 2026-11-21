import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import {
  SCAN_MAX_BYTES,
  SCAN_SESSION_MACHINE,
  SCAN_MAX_PAGES,
  SCAN_SESSION_TTL_SECONDS,
  type CreateScanSessionResponse,
  type ScanSessionPhoneView,
  type ScanSessionStatus,
  type ScanSessionUploadResult,
  type ScanSessionView,
} from 'shared';
import { inspectPdfBytes } from '../envelopes/pdf-inspection';
import { StorageService } from '../storage/storage.service';
import { ScanSessionsRepository, type ScanSessionRecord } from './scan-sessions.repository';

/** Open (unexpired, not yet received) sessions one owner may hold at once. */
export const SCAN_MAX_OPEN_PER_OWNER = 10;
const PURGE_BATCH = 50;
/** 24 random bytes -> a 32 character URL-safe code (192 bits). */
const CODE_BYTES = 24;
const CODE_RE = /^[A-Za-z0-9_-]{32}$/;

export function hashScanCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/**
 * One object per claim, so an upload that lost its claim to a takeover
 * (SCAN_UPLOAD_CLAIM_STALE_MS) can never overwrite the PDF of the upload
 * that replaced it.
 */
export function scanStorageKey(owner_id: string, id: string, claim: string): string {
  return `scan-sessions/${owner_id}/${id}-${Date.parse(claim)}.pdf`;
}

/**
 * Scan with phone. The code is a bearer secret: whoever holds it can post
 * one PDF into the owner's session, and nothing else. Only its hash is
 * stored. Unknown, malformed and foreign codes are the same 404.
 */
@Injectable()
export class ScanSessionsService {
  private readonly log = new Logger(ScanSessionsService.name);

  constructor(
    private readonly repo: ScanSessionsRepository,
    private readonly storage: StorageService,
  ) {}

  async create(owner_id: string, now: Date = new Date()): Promise<CreateScanSessionResponse> {
    await this.purgeExpired(owner_id, now);
    const open = await this.repo.countOpen(owner_id, now.toISOString());
    if (open >= SCAN_MAX_OPEN_PER_OWNER) {
      throw new HttpException('too_many_scan_sessions', HttpStatus.TOO_MANY_REQUESTS);
    }
    const code = randomBytes(CODE_BYTES).toString('base64url');
    const expires_at = new Date(now.getTime() + SCAN_SESSION_TTL_SECONDS * 1000).toISOString();
    await this.repo.insert({
      id: randomUUID(),
      owner_id,
      code_hash: hashScanCode(code),
      expires_at,
    });
    return { code, expires_at };
  }

  /** Owner status poll. */
  async status(owner_id: string, code: string, now: Date = new Date()): Promise<ScanSessionView> {
    const row = await this.ownedRow(owner_id, code);
    return {
      status: this.publicStatus(row, now),
      expires_at: row.expires_at,
      page_count: row.page_count,
    };
  }

  /** What the phone may learn: is the code still good. */
  async phoneStatus(code: string, now: Date = new Date()): Promise<ScanSessionPhoneView> {
    const row = await this.rowFor(code);
    return { status: this.publicStatus(row, now), expires_at: row.expires_at };
  }

  /** The phone posts the finished PDF. Single use. */
  async receive(
    code: string,
    bytes: Buffer,
    now: Date = new Date(),
  ): Promise<ScanSessionUploadResult> {
    const row = await this.rowFor(code);
    if (bytes.length === 0) throw new BadRequestException('file_required');
    if (bytes.length > SCAN_MAX_BYTES) throw new PayloadTooLargeException('file_too_large');
    if (new Date(row.expires_at).getTime() <= now.getTime()) {
      throw new GoneException('scan_session_expired');
    }
    const claim = await this.repo.claim(row.id, now.toISOString());
    if (claim === null) throw new ConflictException('scan_session_used');
    const key = scanStorageKey(row.owner_id, row.id, claim);
    let stored = false;
    try {
      const { pages } = await inspectPdfBytes(bytes);
      if (pages > SCAN_MAX_PAGES) throw new BadRequestException('too_many_pages');
      await this.storage.upload(key, bytes, 'application/pdf');
      stored = true;
      const received = await this.repo.markReceived(
        row.id,
        claim,
        { storage_key: key, page_count: pages, byte_length: bytes.length },
        now.toISOString(),
      );
      // A newer upload took the session over while this one stalled.
      if (!received) throw new ConflictException('scan_session_used');
      return { page_count: pages };
    } catch (err) {
      await this.repo.release(row.id, claim);
      if (stored) await this.removeQuietly(key);
      throw err;
    }
  }

  /** The owner takes the PDF. The object is removed once it has been read. */
  async take(
    owner_id: string,
    code: string,
    now: Date = new Date(),
  ): Promise<{ readonly pdf: Buffer; readonly page_count: number | null }> {
    const row = await this.ownedRow(owner_id, code);
    if (new Date(row.expires_at).getTime() <= now.getTime()) {
      throw new GoneException('scan_session_expired');
    }
    if (!SCAN_SESSION_MACHINE.can(row.status, 'consume') || row.storage_key === null) {
      throw new ConflictException('scan_not_received');
    }
    const pdf = await this.storage.download(row.storage_key);
    if (!(await this.repo.consume(row.id))) throw new ConflictException('scan_not_received');
    await this.removeQuietly(row.storage_key);
    return { pdf, page_count: row.page_count };
  }

  private async removeQuietly(key: string): Promise<void> {
    try {
      await this.storage.remove([key]);
    } catch {
      this.log.warn(`scan-session: could not remove ${key}`);
    }
  }

  /**
   * Display mapping. Past `expires_at` every session reads `expired`, a
   * received one too: `take` refuses it then, so the owner's poll must not
   * offer a PDF it cannot download.
   */
  private publicStatus(row: ScanSessionRecord, now: Date): ScanSessionStatus {
    if (new Date(row.expires_at).getTime() <= now.getTime()) return 'expired';
    switch (row.status) {
      case 'received':
        return 'received';
      case 'consumed':
        return 'expired';
      default:
        return 'pending';
    }
  }

  private async rowFor(code: string): Promise<ScanSessionRecord> {
    if (!CODE_RE.test(code)) throw new NotFoundException('scan_session_not_found');
    const row = await this.repo.findByHash(hashScanCode(code));
    if (!row) throw new NotFoundException('scan_session_not_found');
    return row;
  }

  private async ownedRow(owner_id: string, code: string): Promise<ScanSessionRecord> {
    const row = await this.rowFor(code);
    if (row.owner_id !== owner_id) throw new NotFoundException('scan_session_not_found');
    return row;
  }

  /** Lazy cleanup: this owner's expired rows and any PDF still in storage. */
  private async purgeExpired(owner_id: string, now: Date): Promise<void> {
    try {
      const rows = await this.repo.listExpired(owner_id, now.toISOString(), PURGE_BATCH);
      if (rows.length === 0) return;
      const keys = rows.flatMap((r) => (r.storage_key === null ? [] : [r.storage_key]));
      if (keys.length > 0) await this.storage.remove(keys);
      await this.repo.deleteMany(rows.map((r) => r.id));
    } catch (err) {
      this.log.warn(`scan-session purge failed: ${err instanceof Error ? err.message : 'error'}`);
    }
  }
}
