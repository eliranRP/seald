import type { ApiKeyApprovalNotify, ApiKeyScope } from 'shared';
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
  readonly approvalNotify: ApiKeyApprovalNotify;
  readonly expiresAt: string;
}

export interface PatchApiKeyInput {
  readonly requireOwnerApproval?: boolean;
  readonly allowNewRecipients?: boolean;
  readonly alwaysRequireSignin?: boolean;
  readonly approvalNotify?: ApiKeyApprovalNotify;
}

export abstract class ApiKeysRepository {
  /**
   * Insert one live key under a per-owner lock. Enforces the live-key
   * cap and the unique live name. `name` null asks the repository to
   * assign the next free `Key N`.
   */
  abstract insertLive(input: InsertApiKeyInput): Promise<ApiKeyRecord>;

  abstract listByOwner(ownerId: string): Promise<readonly ApiKeyRecord[]>;

  abstract findByIdForOwner(id: string, ownerId: string): Promise<ApiKeyRecord | null>;

  abstract findByPrefix(prefix: string): Promise<ApiKeyRecord | null>;

  abstract patch(
    id: string,
    ownerId: string,
    patch: PatchApiKeyInput,
  ): Promise<ApiKeyRecord | null>;

  /** Sets `revoked_at` when it is still null. Returns the row either way. */
  abstract revoke(id: string, ownerId: string, revokedAt: string): Promise<ApiKeyRecord | null>;

  /**
   * Stamp `last_used_at` at most once a minute. A newer stamp inside
   * the window is left alone.
   */
  abstract touchLastUsed(id: string, now: Date): Promise<void>;

  /**
   * Expire this key's still-open approval rows, when that table exists.
   * The approvals table is a later migration. A missing table is a no-op.
   */
  abstract expirePendingApprovals(keyId: string, now: Date): Promise<void>;
}
