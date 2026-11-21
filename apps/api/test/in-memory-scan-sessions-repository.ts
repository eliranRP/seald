import { SCAN_SESSION_MACHINE } from 'shared';
import {
  SCAN_UPLOAD_CLAIM_STALE_MS,
  ScanSessionsRepository,
  type InsertScanSession,
  type ScanSessionRecord,
} from '../src/scan-sessions/scan-sessions.repository';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** Hermetic stand-in for `ScanSessionsPgRepository`. */
export class InMemoryScanSessionsRepository extends ScanSessionsRepository {
  private rows = new Map<string, Mutable<ScanSessionRecord>>();

  reset(): void {
    this.rows.clear();
  }

  all(): ScanSessionRecord[] {
    return [...this.rows.values()];
  }

  /** Moves a session's expiry, so a spec can age it without waiting. */
  setExpiry(id: string, expires_at: string): void {
    const row = this.rows.get(id);
    if (row) row.expires_at = expires_at;
  }

  /** Moves a session's claim stamp, so a spec can age an upload. */
  setClaimedAt(id: string, claimed_at: string | null): void {
    const row = this.rows.get(id);
    if (row) row.claimed_at = claimed_at;
  }

  async insert(input: InsertScanSession): Promise<ScanSessionRecord> {
    const row: Mutable<ScanSessionRecord> = {
      id: input.id,
      owner_id: input.owner_id,
      code_hash: input.code_hash,
      status: 'pending',
      storage_key: null,
      page_count: null,
      byte_length: null,
      expires_at: input.expires_at,
      received_at: null,
      claimed_at: null,
      created_at: new Date().toISOString(),
    };
    this.rows.set(row.id, row);
    return { ...row };
  }

  async findByHash(code_hash: string): Promise<ScanSessionRecord | null> {
    const row = [...this.rows.values()].find((r) => r.code_hash === code_hash);
    return row ? { ...row } : null;
  }

  async countOpen(owner_id: string, now: string): Promise<number> {
    return [...this.rows.values()].filter(
      (r) =>
        r.owner_id === owner_id &&
        (r.status === 'pending' || r.status === 'uploading') &&
        r.expires_at > now,
    ).length;
  }

  async claim(id: string, now: string): Promise<string | null> {
    const row = this.rows.get(id);
    if (!row || row.expires_at <= now) return null;
    const stale =
      row.claimed_at === null ||
      Date.parse(row.claimed_at) <= Date.parse(now) - SCAN_UPLOAD_CLAIM_STALE_MS;
    const claimable =
      SCAN_SESSION_MACHINE.can(row.status, 'claim') ||
      (SCAN_SESSION_MACHINE.can(row.status, 'release') && stale);
    if (!claimable) return null;
    row.status = 'uploading';
    row.claimed_at = now;
    return now;
  }

  async markReceived(
    id: string,
    claim: string,
    input: { storage_key: string; page_count: number; byte_length: number },
    now: string,
  ): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || !SCAN_SESSION_MACHINE.can(row.status, 'received') || row.claimed_at !== claim) {
      return false;
    }
    row.status = 'received';
    row.storage_key = input.storage_key;
    row.page_count = input.page_count;
    row.byte_length = input.byte_length;
    row.received_at = now;
    return true;
  }

  async release(id: string, claim: string): Promise<void> {
    const row = this.rows.get(id);
    if (row && SCAN_SESSION_MACHINE.can(row.status, 'release') && row.claimed_at === claim) {
      row.status = 'pending';
    }
  }

  async consume(id: string): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || !SCAN_SESSION_MACHINE.can(row.status, 'consume')) return false;
    row.status = 'consumed';
    return true;
  }

  async listExpired(owner_id: string, now: string, limit: number): Promise<ScanSessionRecord[]> {
    return [...this.rows.values()]
      .filter((r) => r.owner_id === owner_id && r.expires_at <= now)
      .sort((a, b) => a.expires_at.localeCompare(b.expires_at))
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }

  async deleteMany(ids: readonly string[]): Promise<void> {
    for (const id of ids) this.rows.delete(id);
  }
}
