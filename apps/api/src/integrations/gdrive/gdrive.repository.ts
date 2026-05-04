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
  readonly refreshTokenCiphertext: Buffer;
  readonly refreshTokenKmsKeyArn: string;
  readonly scope: string;
  readonly connectedAt: string;
  readonly lastUsedAt: string | null;
  readonly deletedAt: string | null;
}

/**
 * Port for `gdrive_accounts` access. The Postgres adapter
 * (`gdrive.repository.pg.ts`) is the only place that touches Kysely.
 * Soft-deletes are the rule — we keep history for audit + GDPR
 * subject-access requests.
 */
export interface GDriveRepository {
  findByIdForUser(id: string, userId: string): Promise<GDriveAccount | null>;
  listForUser(userId: string): Promise<ReadonlyArray<GDriveAccount>>;
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
  softDelete(id: string, userId: string): Promise<boolean>;
  touchLastUsed(id: string): Promise<void>;
}

export const GDRIVE_REPOSITORY = Symbol('GDRIVE_REPOSITORY');
