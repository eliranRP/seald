import { randomUUID } from 'node:crypto';
import {
  BadGatewayException,
  ConflictException,
  GatewayTimeoutException,
  GoneException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import {
  isFeatureEnabled,
  MCP_UPLOAD_DAILY_CAP,
  MCP_UPLOAD_MAX_BYTES,
  MCP_UPLOAD_PUT_TTL_SECONDS,
  MCP_UPLOAD_STAGING_TTL_SECONDS,
  type EnvelopeDocument,
  type McpStagedDocument,
} from 'shared';
import {
  EnvelopeDocumentsService,
  titleFromFilename,
} from '../envelopes/documents/envelope-documents.service';
import type { Envelope } from '../envelopes/envelope.entity';
import { EnvelopesService } from '../envelopes/envelopes.service';
import { inspectPdfBytes } from '../envelopes/pdf-inspection';
import {
  conversionAssetPath,
  GOTENBERG_CLIENT,
  type GotenbergClient,
} from '../integrations/gdrive/conversion/conversion.service';
import { StorageService } from '../storage/storage.service';
import { decodeBase64Strict, detectStagedFileKind } from './file-type';
import { StagedUploadsRepository, type StagedUploadRecord } from './staged-uploads.repository';

/** The doc's converter limit: give up on a local conversion after 25 seconds. */
const CONVERSION_TIMEOUT_MS = 25_000;

export function stagingKey(owner_id: string, id: string): string {
  return `mcp-uploads/${owner_id}/${id}.pdf`;
}

function utcMidnight(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function secondsToNextUtcDay(now: Date): number {
  const next = utcMidnight(now).getTime() + 86_400_000;
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

export interface PresignedUpload {
  readonly upload_id: string;
  readonly upload_url: string;
  readonly method: 'PUT';
  readonly headers: Readonly<Record<string, string>>;
  readonly expires_in_seconds: number;
  readonly max_bytes: number;
}

/**
 * Staged uploads for MCP (docs/design/mcp-server.md § `documents_upload`,
 * step 8b; parity plan WP-19). One table, `mcp_uploads`, three ways in:
 *
 * - inline base64 (up to about 700 KB): checked, stored and completed in
 *   one call;
 * - a presigned PUT (up to 25 MB): `start` makes the row and the URL,
 *   `complete` re-checks size and magic bytes on what storage received,
 *   because that PUT never passed through the API;
 * - a Drive import: the conversion result is copied in (step 8d).
 *
 * A completed upload is attached to a draft once (`consumed_at`), through
 * the same document services the HTTP upload routes call. Completed
 * uploads count toward a per-owner daily cap under an advisory lock.
 */
@Injectable()
export class StagedUploadsService {
  private readonly log = new Logger(StagedUploadsService.name);

  constructor(
    private readonly repo: StagedUploadsRepository,
    private readonly storage: StorageService,
    private readonly envelopes: EnvelopesService,
    private readonly documents: EnvelopeDocumentsService,
    @Optional() @Inject(GOTENBERG_CLIENT) private readonly gotenberg?: GotenbergClient,
  ) {}

  // ---------------------------------------------------------------- inline

  /** `documents_upload`: base64 → staged, completed PDF. */
  async stageInline(
    owner_id: string,
    input: { readonly filename: string; readonly content_base64: string },
    now: Date = new Date(),
  ): Promise<McpStagedDocument> {
    const bytes = this.decode(input.content_base64);
    const pdf = await this.toPdf(bytes);
    const { pages, sha256 } = await inspectPdfBytes(pdf);
    await this.assertUnderCap(owner_id, now);
    const id = randomUUID();
    const row = await this.repo.insert({
      id,
      owner_id,
      storage_key: stagingKey(owner_id, id),
      filename: input.filename,
      source: 'upload',
      expires_at: new Date(now.getTime() + MCP_UPLOAD_STAGING_TTL_SECONDS * 1000).toISOString(),
    });
    try {
      await this.storage.upload(row.storage_key, pdf, 'application/pdf');
      await this.completeRow(row, { sha256, pages, byte_length: pdf.length }, now);
    } catch (err) {
      await this.discard(row);
      throw err;
    }
    return this.view({ ...row, sha256, page_count: pages, byte_length: pdf.length });
  }

  /** Dry run of {@link stageInline}: the checks, no write and no conversion. */
  async previewInline(
    owner_id: string,
    input: { readonly filename: string; readonly content_base64: string },
    now: Date = new Date(),
  ): Promise<Record<string, unknown>> {
    const bytes = this.decode(input.content_base64);
    if (bytes.length > MCP_UPLOAD_MAX_BYTES) throw new PayloadTooLargeException('file_too_large');
    const kind = detectStagedFileKind(bytes);
    if (kind === null) throw new UnsupportedMediaTypeException('unsupported_file_type');
    const inspected = kind === 'pdf' ? await inspectPdfBytes(bytes) : null;
    const used = await this.repo.countCompletedSince(owner_id, utcMidnight(now).toISOString());
    return {
      filename: input.filename,
      byte_length: bytes.length,
      converts_to_pdf: kind === 'docx',
      page_count: inspected?.pages ?? null,
      sha256: inspected?.sha256 ?? null,
      uploads_today: used,
      daily_cap: MCP_UPLOAD_DAILY_CAP,
    };
  }

  // ------------------------------------------------------------- presigned

  /** `documents_upload_start`: the staging row and a presigned PUT. */
  async startUpload(
    owner_id: string,
    input: { readonly filename: string; readonly byte_length?: number },
    now: Date = new Date(),
  ): Promise<PresignedUpload> {
    this.assertSizeHint(input.byte_length);
    await this.assertUnderCap(owner_id, now);
    const id = randomUUID();
    const row = await this.repo.insert({
      id,
      owner_id,
      storage_key: stagingKey(owner_id, id),
      filename: input.filename,
      source: 'upload',
      expires_at: new Date(now.getTime() + MCP_UPLOAD_STAGING_TTL_SECONDS * 1000).toISOString(),
    });
    try {
      const signed = await this.storage.createSignedUploadUrl(
        row.storage_key,
        MCP_UPLOAD_PUT_TTL_SECONDS,
      );
      return {
        upload_id: row.id,
        upload_url: signed.url,
        method: signed.method,
        headers: { ...signed.headers },
        expires_in_seconds: MCP_UPLOAD_PUT_TTL_SECONDS,
        max_bytes: MCP_UPLOAD_MAX_BYTES,
      };
    } catch (err) {
      await this.repo.delete(owner_id, row.id);
      throw err;
    }
  }

  async previewStart(
    owner_id: string,
    input: { readonly filename: string; readonly byte_length?: number },
    now: Date = new Date(),
  ): Promise<Record<string, unknown>> {
    this.assertSizeHint(input.byte_length);
    const used = await this.repo.countCompletedSince(owner_id, utcMidnight(now).toISOString());
    return {
      filename: input.filename,
      max_bytes: MCP_UPLOAD_MAX_BYTES,
      expires_in_seconds: MCP_UPLOAD_PUT_TTL_SECONDS,
      uploads_today: used,
      daily_cap: MCP_UPLOAD_DAILY_CAP,
    };
  }

  /**
   * `documents_upload_complete`: re-check what storage received (size,
   * magic bytes, a readable PDF), convert a .docx, then the conditional
   * complete. A failed check leaves the row incomplete and removes the
   * object, so the client starts over.
   */
  async completeUpload(
    owner_id: string,
    upload_id: string,
    now: Date = new Date(),
  ): Promise<McpStagedDocument> {
    const row = await this.pendingRow(owner_id, upload_id, now);
    let received: Buffer;
    try {
      received = await this.storage.download(row.storage_key);
    } catch {
      throw new ConflictException('upload_not_received');
    }
    let pdf: Buffer;
    let inspected: { pages: number; sha256: string };
    try {
      pdf = await this.toPdf(received);
      inspected = await inspectPdfBytes(pdf);
      if (pdf !== received) await this.storage.upload(row.storage_key, pdf, 'application/pdf');
    } catch (err) {
      await this.removeObject(row.storage_key);
      throw err;
    }
    await this.completeRow(
      row,
      { sha256: inspected.sha256, pages: inspected.pages, byte_length: pdf.length },
      now,
    );
    return this.view({
      ...row,
      sha256: inspected.sha256,
      page_count: inspected.pages,
      byte_length: pdf.length,
    });
  }

  async previewComplete(
    owner_id: string,
    upload_id: string,
    now: Date = new Date(),
  ): Promise<Record<string, unknown>> {
    const row = await this.pendingRow(owner_id, upload_id, now);
    return { upload_id: row.id, received: await this.storage.exists(row.storage_key) };
  }

  // ---------------------------------------------------------------- attach

  /**
   * `envelopes_upload_pdf`: the upload replaces document 1, through the
   * same service call `POST /envelopes/:id/upload` makes for the flag.
   */
  async attachAsPrimary(
    owner_id: string,
    envelope_id: string,
    upload_id: string,
    now: Date = new Date(),
  ): Promise<Envelope> {
    return this.withConsumed(owner_id, upload_id, now, async (row, bytes) => {
      const envelope = isFeatureEnabled('multiDocumentEnvelopes')
        ? await this.documents.replacePrimary(owner_id, envelope_id, bytes)
        : await this.envelopes.uploadOriginal(owner_id, envelope_id, bytes);
      if (row.source === 'gdrive' && row.drive_file_name) {
        const first = (await this.documents.listForEnvelope(envelope_id))[0];
        if (first)
          await this.repo.setDocumentDriveSource(envelope_id, first.id, row.drive_file_name);
      }
      return envelope;
    });
  }

  /** `envelopes_add_document` / `envelopes_prepare`: append as the next document. */
  async attachAsDocument(
    owner_id: string,
    envelope_id: string,
    upload_id: string,
    title: string | null,
    now: Date = new Date(),
  ): Promise<EnvelopeDocument> {
    return this.withConsumed(owner_id, upload_id, now, async (row, bytes) => {
      const doc = await this.documents.add(
        owner_id,
        envelope_id,
        bytes,
        title ?? titleFromFilename(row.filename ?? undefined),
      );
      if (row.source === 'gdrive' && row.drive_file_name) {
        await this.repo.setDocumentDriveSource(envelope_id, doc.id, row.drive_file_name);
      }
      return doc;
    });
  }

  /** Read-only check that an upload could be attached now (dry runs, prepare). */
  async assertAttachable(
    owner_id: string,
    upload_id: string,
    now: Date = new Date(),
  ): Promise<McpStagedDocument> {
    return this.view(await this.attachableRow(owner_id, upload_id, now));
  }

  // ----------------------------------------------------------- Drive import

  /** Step 8d: the row a Drive import fills once its conversion is done. */
  async beginDriveImport(
    owner_id: string,
    input: { readonly drive_file_id: string; readonly drive_file_name: string },
    now: Date = new Date(),
  ): Promise<StagedUploadRecord> {
    await this.assertUnderCap(owner_id, now);
    const id = randomUUID();
    return this.repo.insert({
      id,
      owner_id,
      storage_key: stagingKey(owner_id, id),
      filename: input.drive_file_name.slice(0, 255),
      source: 'gdrive',
      drive_file_id: input.drive_file_id,
      drive_file_name: input.drive_file_name.slice(0, 1024),
      expires_at: new Date(now.getTime() + MCP_UPLOAD_STAGING_TTL_SECONDS * 1000).toISOString(),
    });
  }

  async setConversionJob(owner_id: string, upload_id: string, job_id: string): Promise<void> {
    await this.repo.setConversionJob(owner_id, upload_id, job_id);
  }

  async findByConversionJob(owner_id: string, job_id: string): Promise<StagedUploadRecord | null> {
    return this.repo.findByJob(owner_id, job_id);
  }

  /**
   * Copy a finished conversion (always a PDF) into the staging row. A row
   * already complete is returned as it is, so a repeated poll is safe.
   */
  async finishDriveImport(
    owner_id: string,
    upload_id: string,
    job_id: string,
    now: Date = new Date(),
  ): Promise<McpStagedDocument> {
    const row = await this.repo.find(owner_id, upload_id);
    if (!row) throw new NotFoundException('upload_not_found');
    if (row.completed_at !== null) return this.view(row);
    const assetPath = conversionAssetPath(owner_id, job_id);
    const pdf = await this.storage.download(assetPath);
    if (pdf.length > MCP_UPLOAD_MAX_BYTES) throw new PayloadTooLargeException('file_too_large');
    const { pages, sha256 } = await inspectPdfBytes(pdf);
    await this.storage.upload(row.storage_key, pdf, 'application/pdf');
    await this.completeRow(row, { sha256, pages, byte_length: pdf.length }, now);
    await this.removeObject(assetPath);
    return this.view({ ...row, sha256, page_count: pages, byte_length: pdf.length });
  }

  /** Drop a Drive import row whose conversion failed or was cancelled. */
  async abandonDriveImport(owner_id: string, upload_id: string): Promise<void> {
    const row = await this.repo.find(owner_id, upload_id);
    if (row && row.completed_at === null) await this.discard(row);
  }

  // --------------------------------------------------------------- cleanup

  /**
   * The cleanup pass: delete expired rows that were never attached
   * (including starts that never completed) and their staging objects.
   */
  async sweepExpired(
    now: Date = new Date(),
    limit = 200,
  ): Promise<{ readonly deleted: number; readonly objects_failed: number }> {
    const rows = await this.repo.listExpiredUnattached(now.toISOString(), limit);
    if (rows.length === 0) return { deleted: 0, objects_failed: 0 };
    let objects_failed = 0;
    try {
      await this.storage.remove(rows.map((r) => r.storage_key));
    } catch {
      objects_failed = rows.length;
      this.log.warn(`mcp-upload-sweep: storage remove failed count=${rows.length}`);
    }
    const deleted = objects_failed > 0 ? 0 : await this.repo.deleteMany(rows.map((r) => r.id));
    return { deleted, objects_failed };
  }

  /** Account deletion: remove every staging object (rows cascade with the user). */
  async purgeOwner(owner_id: string): Promise<number> {
    const keys = await this.repo.listStorageKeys(owner_id);
    if (keys.length > 0) await this.storage.remove([...keys]);
    return keys.length;
  }

  // -------------------------------------------------------------- helpers

  view(row: StagedUploadRecord): McpStagedDocument {
    if (row.sha256 === null || row.page_count === null || row.byte_length === null) {
      throw new ConflictException('upload_not_complete');
    }
    return {
      document_id: row.id,
      filename: row.filename,
      mime: 'application/pdf',
      page_count: row.page_count,
      byte_length: row.byte_length,
      sha256: row.sha256,
      thumbnail_url: row.thumbnail_url,
      expires_at: row.expires_at,
      source: row.source,
    };
  }

  private decode(content_base64: string): Buffer {
    const bytes = decodeBase64Strict(content_base64);
    if (bytes === null || bytes.length === 0) throw new HttpException('invalid_base64', 400);
    return bytes;
  }

  private assertSizeHint(byte_length: number | undefined): void {
    if (byte_length !== undefined && byte_length > MCP_UPLOAD_MAX_BYTES) {
      throw new PayloadTooLargeException('file_too_large');
    }
  }

  private async toPdf(bytes: Buffer): Promise<Buffer> {
    if (bytes.length > MCP_UPLOAD_MAX_BYTES) throw new PayloadTooLargeException('file_too_large');
    const kind = detectStagedFileKind(bytes);
    if (kind === 'pdf') return bytes;
    if (kind === 'docx') return this.convertDocx(bytes);
    throw new UnsupportedMediaTypeException('unsupported_file_type');
  }

  /** Local .docx → PDF on the Gotenberg sidecar (no egress), 25 s at most. */
  private async convertDocx(bytes: Buffer): Promise<Buffer> {
    if (!this.gotenberg) throw new ServiceUnavailableException('conversion_unavailable');
    let res: { ok: boolean; status: number; body: Buffer };
    try {
      res = await this.gotenberg({
        fileBytes: bytes,
        filename: 'upload.docx',
        signal: AbortSignal.timeout(CONVERSION_TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        throw new GatewayTimeoutException('conversion_timeout');
      }
      throw new BadGatewayException('conversion_failed');
    }
    if (!res.ok) {
      this.log.warn(`mcp-upload: gotenberg status=${res.status}`);
      throw new BadGatewayException('conversion_failed');
    }
    if (res.body.length > MCP_UPLOAD_MAX_BYTES)
      throw new PayloadTooLargeException('file_too_large');
    return res.body;
  }

  private async assertUnderCap(owner_id: string, now: Date): Promise<void> {
    const used = await this.repo.countCompletedSince(owner_id, utcMidnight(now).toISOString());
    if (used >= MCP_UPLOAD_DAILY_CAP) throw dailyCap(now);
  }

  private async completeRow(
    row: StagedUploadRecord,
    file: { readonly sha256: string; readonly pages: number; readonly byte_length: number },
    now: Date,
  ): Promise<void> {
    const outcome = await this.repo.complete({
      id: row.id,
      owner_id: row.owner_id,
      mime: 'application/pdf',
      sha256: file.sha256,
      byte_length: file.byte_length,
      page_count: file.pages,
      daily_cap: MCP_UPLOAD_DAILY_CAP,
    });
    if (outcome === 'daily_cap') throw dailyCap(now);
    if (outcome === 'not_pending') throw new ConflictException('upload_already_completed');
  }

  private async pendingRow(
    owner_id: string,
    upload_id: string,
    now: Date,
  ): Promise<StagedUploadRecord> {
    const row = await this.repo.find(owner_id, upload_id);
    if (!row || row.source !== 'upload') throw new NotFoundException('upload_not_found');
    if (row.completed_at !== null) throw new ConflictException('upload_already_completed');
    if (Date.parse(row.expires_at) <= now.getTime()) throw new GoneException('upload_expired');
    return row;
  }

  private async attachableRow(
    owner_id: string,
    upload_id: string,
    now: Date,
  ): Promise<StagedUploadRecord> {
    const row = await this.repo.find(owner_id, upload_id);
    if (!row) throw new NotFoundException('upload_not_found');
    if (row.completed_at === null) throw new ConflictException('upload_not_complete');
    if (row.consumed_at !== null) throw new ConflictException('upload_already_attached');
    if (Date.parse(row.expires_at) <= now.getTime()) throw new GoneException('upload_expired');
    return row;
  }

  /**
   * Claim the upload (`consumed_at`), run the attach, then delete the
   * staging object. A failed attach gives the claim back.
   */
  private async withConsumed<T>(
    owner_id: string,
    upload_id: string,
    now: Date,
    attach: (row: StagedUploadRecord, bytes: Buffer) => Promise<T>,
  ): Promise<T> {
    await this.attachableRow(owner_id, upload_id, now);
    const claimed = await this.repo.consume(owner_id, upload_id);
    if (!claimed) throw new ConflictException('upload_already_attached');
    let out: T;
    try {
      const bytes = await this.storage.download(claimed.storage_key);
      out = await attach(claimed, bytes);
    } catch (err) {
      await this.repo.releaseClaim(owner_id, upload_id);
      throw err;
    }
    await this.removeObject(claimed.storage_key);
    return out;
  }

  private async discard(row: StagedUploadRecord): Promise<void> {
    await this.removeObject(row.storage_key);
    await this.repo.delete(row.owner_id, row.id);
  }

  private async removeObject(key: string): Promise<void> {
    try {
      await this.storage.remove([key]);
    } catch {
      // The sweep retries expired rows; a stray object here is harmless.
      this.log.warn('mcp-upload: staging object remove failed');
    }
  }
}

function dailyCap(now: Date): HttpException {
  return new HttpException(
    { message: 'upload_daily_cap', retryAfter: secondsToNextUtcDay(now) },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
