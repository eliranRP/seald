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
  softDelete(id: string, userId: string): Promise<boolean>;
  touchLastUsed(id: string): Promise<void>;
}

export const GDRIVE_REPOSITORY = Symbol('GDRIVE_REPOSITORY');
