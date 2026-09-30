import type { ApiKeyScope } from 'shared';

/** A stored key. `keyHash` never leaves the server. */
export interface ApiKeyRecord {
  readonly id: string;
  readonly ownerId: string;
  readonly name: string;
  readonly prefix: string;
  readonly keyHash: string;
  readonly scopes: readonly ApiKeyScope[];
  readonly requireOwnerApproval: boolean;
  readonly allowNewRecipients: boolean;
  readonly alwaysRequireSignin: boolean;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
}

/** Wire shape. No hash, and no secret except on create. */
export interface ApiKeyView {
  readonly id: string;
  readonly name: string;
  readonly prefix: string;
  readonly scopes: readonly ApiKeyScope[];
  readonly require_owner_approval: boolean;
  readonly allow_new_recipients: boolean;
  readonly always_require_signin: boolean;
  readonly created_at: string;
  readonly last_used_at: string | null;
  readonly expires_at: string | null;
  readonly revoked_at: string | null;
}

export interface ApiKeyCreatedView extends ApiKeyView {
  readonly secret: string;
}

export function toApiKeyView(row: ApiKeyRecord): ApiKeyView {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes,
    require_owner_approval: row.requireOwnerApproval,
    allow_new_recipients: row.allowNewRecipients,
    always_require_signin: row.alwaysRequireSignin,
    created_at: row.createdAt,
    last_used_at: row.lastUsedAt,
    expires_at: row.expiresAt,
    revoked_at: row.revokedAt,
  };
}

export class ApiKeyLimitError extends Error {
  constructor() {
    super('key_limit');
    this.name = 'ApiKeyLimitError';
  }
}

export class ApiKeyNameTakenError extends Error {
  constructor() {
    super('name_taken');
    this.name = 'ApiKeyNameTakenError';
  }
}

export class ApiKeyPrefixCollisionError extends Error {
  constructor() {
    super('prefix_collision');
    this.name = 'ApiKeyPrefixCollisionError';
  }
}
