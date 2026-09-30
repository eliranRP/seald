/**
 * Domain row for a connected Google Drive account. The refresh token is
 * always carried as KMS-envelope-encrypted bytes (red-flag row 3 — never
 * plaintext at rest, never in logs). The `kmsKeyArn` is stored alongside
 * so a future key rotation can decrypt rows that pre-date the rotation.
 */
export interface GDriveAccount {
  readonly id: string;
  readonly userId: string;
  readonly googleUserId: string;
  readonly googleEmail: string;
  /** NULL after disconnect. The wrapped data key lives inside this blob. */
  readonly refreshTokenCiphertext: Buffer | null;
  /** NULL after disconnect, together with the ciphertext. */
  readonly refreshTokenKmsKeyArn: string | null;
  readonly scope: string;
  readonly connectedAt: string;
  readonly lastUsedAt: string | null;
  readonly deletedAt: string | null;
}

/**
 * Port for `gdrive_accounts` access. The Postgres adapter
 * (`gdrive.repository.pg.ts`) is the only place that touches Kysely.
 * Disconnect keeps the row (Google email, connected_at, deleted_at)
 * and erases the token. Account deletion hard-deletes every row.
 */
export interface GDriveRepository {
  findByIdForUser(id: string, userId: string): Promise<GDriveAccount | null>;
  /**
   * Same ownership check as `findByIdForUser`, including soft-deleted
   * rows. Disconnect uses this so a retry can finish erasing a token
   * that an older soft-delete left behind.
   */
  findByIdForUserIncludingDeleted(id: string, userId: string): Promise<GDriveAccount | null>;
  listForUser(userId: string): Promise<ReadonlyArray<GDriveAccount>>;
  /**
   * Every connection for this user, including soft-deleted rows that
   * may still hold a refresh token. Account deletion revokes those
   * before the hard delete.
   */
  listAllForUser(userId: string): Promise<ReadonlyArray<GDriveAccount>>;
  insert(row: GDriveAccount): Promise<GDriveAccount>;
  /**
   * Look up an active (non-soft-deleted) row by (userId, googleUserId).
   * Used by `completeOAuth` to make reconnect idempotent — the partial
   * UNIQUE index `gdrive_accounts_user_google_uniq` would otherwise
   * fire a 23505 on the second insert (Bug H).
   */
  findActiveByUserAndGoogleUser(
    userId: string,
    googleUserId: string,
  ): Promise<GDriveAccount | null>;
  /**
   * Rotate an existing row's encrypted refresh token + scope + email
   * in place. The (userId, googleUserId) pair is immutable for the row;
   * this is the idempotent counterpart to insert.
   */
  replaceToken(args: {
    id: string;
    refreshTokenCiphertext: Buffer;
    refreshTokenKmsKeyArn: string;
    scope: string;
    googleEmail: string;
  }): Promise<GDriveAccount>;
  /**
   * One update: set `deleted_at` if it is still null, and set both
   * token columns to NULL. Keeps Google email and `connected_at`.
   * Safe to run again.
   */
  disconnect(id: string, userId: string): Promise<boolean>;
  /**
   * Hard-delete every connection for this user, including rows that
   * were already soft-deleted. `gdrive_envelope_exports` cascades.
   */
  deleteAllByUser(userId: string): Promise<number>;
  touchLastUsed(id: string): Promise<void>;
}

export const GDRIVE_REPOSITORY = Symbol('GDRIVE_REPOSITORY');
