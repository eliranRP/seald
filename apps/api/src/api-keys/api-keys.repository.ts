import type { ApiKeyScope } from 'shared';
import type { ApiKeyRecord } from './api-keys.types';

export interface InsertApiKeyInput {
  readonly ownerId: string;
  readonly name: string | null;
  readonly prefix: string;
  readonly keyHash: string;
  readonly scopes: readonly ApiKeyScope[];
  readonly requireOwnerApproval: boolean;
  readonly allowNewRecipients: boolean;
  readonly alwaysRequireSignin: boolean;
  readonly expiresAt: string;
}

/**
 * A non-revoked key occupies a slot until `expires_at`. A missing expiry
 * still counts, so a row cannot hide from the cap. Expired rows stay
 * listed and can be revoked, but they do not block a new key.
 */
export function countsTowardLiveCap(
  expiresAt: string | Date | null | undefined,
  nowMs: number,
): boolean {
  if (expiresAt == null) return true;
  const ms = expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(expiresAt);
  return Number.isNaN(ms) || ms > nowMs;
}

export abstract class ApiKeysRepository {
  /**
   * Insert one live key under a per-owner lock. The cap counts keys that
   * are not revoked and not expired. The unique live name still includes
   * expired rows. `name` null asks the repository to assign the next free
   * `Key N`.
   */
  abstract insertLive(input: InsertApiKeyInput): Promise<ApiKeyRecord>;

  abstract listByOwner(ownerId: string): Promise<readonly ApiKeyRecord[]>;

  abstract findByIdForOwner(id: string, ownerId: string): Promise<ApiKeyRecord | null>;

  abstract findByPrefix(prefix: string): Promise<ApiKeyRecord | null>;

  /** Sets `revoked_at` when it is still null. Returns the row either way. */
  abstract revoke(id: string, ownerId: string, revokedAt: string): Promise<ApiKeyRecord | null>;

  /**
   * Stamp `last_used_at` at most once a minute. A newer stamp inside
   * the window is left alone.
   */
  abstract touchLastUsed(id: string, now: Date): Promise<void>;

  /** Hard-delete every key owned by this user. Account deletion calls this. */
  abstract deleteAllByOwner(ownerId: string): Promise<number>;
}
