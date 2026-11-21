/**
 * Port for scan sessions (redesign v2 WS-J, migration 0044). The pg adapter
 * is `ScanSessionsPgRepository`; e2e specs use an in-memory one. Dates are
 * ISO strings.
 */

export type ScanSessionRowStatus = 'pending' | 'uploading' | 'received' | 'consumed';

export interface ScanSessionRecord {
  readonly id: string;
  readonly owner_id: string;
  readonly code_hash: string;
  readonly status: ScanSessionRowStatus;
  readonly storage_key: string | null;
  readonly page_count: number | null;
  readonly byte_length: number | null;
  readonly expires_at: string;
  readonly received_at: string | null;
  /** When the current (or last) upload claimed the session (migration 0054). */
  readonly claimed_at: string | null;
  readonly created_at: string;
}

/**
 * An `uploading` session whose claim is older than this is taken to be a
 * crashed upload, and the next upload may take it over. Well above how
 * long an upload runs (the body is already read; only the PDF inspection
 * and one storage put remain), and well inside the 10-minute session.
 */
export const SCAN_UPLOAD_CLAIM_STALE_MS = 2 * 60_000;

export interface InsertScanSession {
  readonly id: string;
  readonly owner_id: string;
  readonly code_hash: string;
  readonly expires_at: string;
}

export abstract class ScanSessionsRepository {
  abstract insert(input: InsertScanSession): Promise<ScanSessionRecord>;

  abstract findByHash(code_hash: string): Promise<ScanSessionRecord | null>;

  /** Unexpired sessions the owner still has open (pending or uploading). */
  abstract countOpen(owner_id: string, now: string): Promise<number>;

  /**
   * Not expired, and pending or `uploading` with a claim older than
   * {@link SCAN_UPLOAD_CLAIM_STALE_MS} (a crashed upload) -> uploading,
   * stamping `claimed_at = now`. Returns that stamp, the claim's identity
   * for the finishing writes, or null when another request holds it.
   */
  abstract claim(id: string, now: string): Promise<string | null>;

  /**
   * uploading -> received, with what the phone posted, only while `claim`
   * is still the session's claim (SM.3). False when a newer upload took
   * the session over.
   */
  abstract markReceived(
    id: string,
    claim: string,
    input: {
      readonly storage_key: string;
      readonly page_count: number;
      readonly byte_length: number;
    },
    now: string,
  ): Promise<boolean>;

  /** uploading -> pending after a failed upload, only while `claim` is still current. */
  abstract release(id: string, claim: string): Promise<void>;

  /** received -> consumed. False when it was not received (or already taken). */
  abstract consume(id: string): Promise<boolean>;

  /** The owner's expired rows, oldest first, for the lazy purge. */
  abstract listExpired(owner_id: string, now: string, limit: number): Promise<ScanSessionRecord[]>;

  abstract deleteMany(ids: readonly string[]): Promise<void>;
}
