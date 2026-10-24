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
  readonly created_at: string;
}

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

  /** pending and not expired -> uploading. False when another request won. */
  abstract claim(id: string, now: string): Promise<boolean>;

  /** uploading -> received, with what the phone posted. */
  abstract markReceived(
    id: string,
    input: {
      readonly storage_key: string;
      readonly page_count: number;
      readonly byte_length: number;
    },
    now: string,
  ): Promise<void>;

  /** uploading -> pending, after a failed upload. */
  abstract release(id: string): Promise<void>;

  /** received -> consumed. False when it was not received (or already taken). */
  abstract consume(id: string): Promise<boolean>;

  /** The owner's expired rows, oldest first, for the lazy purge. */
  abstract listExpired(owner_id: string, now: string, limit: number): Promise<ScanSessionRecord[]>;

  abstract deleteMany(ids: readonly string[]): Promise<void>;
}
