import type { InsertOutboundEmailInput } from '../email/outbound-emails.repository';

/** One `api_keys` row. `keyHash` never leaves the api-keys module. */
export interface ApiKeyRecord {
  readonly id: string;
  readonly ownerId: string;
  readonly name: string;
  readonly prefix: string;
  readonly keyHash: string;
  readonly scopes: readonly string[];
  readonly requireOwnerApproval: boolean;
  readonly allowNewRecipients: boolean;
  readonly alwaysRequireSignin: boolean;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
}

export interface CreateApiKeyRowInput {
  readonly ownerId: string;
  /** Null asks the repository to pick `Key N` inside the owner lock. */
  readonly name: string | null;
  readonly prefix: string;
  readonly keyHash: string;
  readonly scopes: readonly string[];
  readonly expiresAt: string;
  readonly alwaysRequireSignin: boolean;
  /** Live (not revoked) keys allowed, counted inside the lock. */
  readonly cap: number;
  /**
   * The owner notification. Built from the stored row and inserted in the
   * same transaction as the key, so a key never exists without its email.
   */
  readonly notification: (key: ApiKeyRecord) => InsertOutboundEmailInput;
}

export type CreateApiKeyRowResult =
  | { readonly ok: true; readonly key: ApiKeyRecord }
  | { readonly ok: false; readonly reason: 'cap_reached' | 'name_taken' | 'prefix_taken' };

export type RevokeApiKeyResult = 'revoked' | 'already_revoked' | 'not_found';

/**
 * Port for `public.api_keys` (migration 0028). The Postgres adapter is
 * `ApiKeysPgRepository`; e2e specs use an in-memory double.
 */
export abstract class ApiKeysRepository {
  /** Owner's keys that are not revoked (live and expired), newest first. */
  abstract listLive(ownerId: string): Promise<readonly ApiKeyRecord[]>;

  /**
   * Insert a key, enforcing the live-key cap and the default name under a
   * per-owner lock (`pg_advisory_xact_lock`). A count-then-insert without
   * the lock is not enough; the partial unique index on
   * `(owner_id, lower(name))` is the backstop.
   */
  abstract createWithinCap(input: CreateApiKeyRowInput): Promise<CreateApiKeyRowResult>;

  /** Lookup by the unique `prefix`, any state. Used by the verifier. */
  abstract findByPrefix(prefix: string): Promise<ApiKeyRecord | null>;

  /** Set `revoked_at`. The row is kept (audit snapshots point at it). */
  abstract revoke(ownerId: string, id: string, now: Date): Promise<RevokeApiKeyResult>;

  /** WP-45: one of the owner's keys, in any state. Another owner's id is null. */
  abstract findOwned(ownerId: string, id: string): Promise<ApiKeyRecord | null>;

  /**
   * WP-45: set `require_owner_approval` on one of the owner's keys that is
   * not revoked. Null when no such key exists.
   */
  abstract setRequireOwnerApproval(
    ownerId: string,
    id: string,
    value: boolean,
  ): Promise<ApiKeyRecord | null>;

  /** Bump `last_used_at`, at most once a minute per key. */
  abstract touchLastUsed(id: string, now: Date): Promise<void>;

  /** Account deletion. The auth.users FK also cascades. */
  abstract deleteAllByOwner(ownerId: string): Promise<number>;
}

const DEFAULT_NAME = /^key (\d{1,6})$/i;

/**
 * `Key N`: the smallest N >= 1 not used by any of the owner's keys,
 * revoked ones included, so an audit snapshot "Key 2" names one row.
 */
export function nextDefaultKeyName(existingNames: readonly string[]): string {
  const used = new Set<number>();
  for (const name of existingNames) {
    const match = DEFAULT_NAME.exec(name.trim());
    if (match) used.add(Number(match[1]));
  }
  let n = 1;
  while (used.has(n)) n += 1;
  return `Key ${n}`;
}
