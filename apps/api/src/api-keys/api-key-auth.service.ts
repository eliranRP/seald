import { timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { isApiKeyScope, type ApiKeyScope } from 'shared';
import { looksLikeApiKey, parseApiKey } from './api-key-secret';
import { ApiKeysRepository } from './api-keys.repository';

/** Who a verified key acts for, plus the audit snapshot of the key. */
export interface ApiKeyPrincipal {
  readonly ok: true;
  readonly ownerId: string;
  readonly keyId: string;
  readonly scopes: readonly ApiKeyScope[];
  /** Copied onto audit rows at write time (`key_name`, `key_prefix`). */
  readonly keyName: string;
  readonly keyPrefix: string;
  readonly requireOwnerApproval: boolean;
  readonly allowNewRecipients: boolean;
  readonly alwaysRequireSignin: boolean;
}

/**
 * Every failure is an HTTP 401 for the caller (the MCP doc's error table).
 * `invalid_token` covers a malformed value, a bad checksum, an unknown
 * prefix and a hash mismatch alike, so a caller cannot tell them apart.
 */
export type ApiKeyAuthError =
  | 'missing_token'
  | 'invalid_token'
  | 'api_key_revoked'
  | 'api_key_expired';

export interface ApiKeyAuthFailure {
  readonly ok: false;
  readonly error: ApiKeyAuthError;
}

export type ApiKeyVerifyResult = ApiKeyPrincipal | ApiKeyAuthFailure;

const DUMMY_HASH = Buffer.alloc(32);

/**
 * The one API-key verifier. `McpAuthGuard` (WP-17) and the REST v1
 * `ApiKeyGuard` (WP-35) both call `verify()`; nothing else checks keys.
 *
 * Order (docs/design/mcp-server.md § API keys, Verification):
 * 1. Reject anything that is not `seald_live_…` with a valid checksum.
 * 2. Look the row up by its unique `prefix`.
 * 3. Compare the SHA-256 with `timingSafeEqual` (also against a dummy
 *    hash when no row exists, so timing does not reveal the prefix).
 * 4. Only then report revoked / expired, so knowing a prefix alone tells
 *    an attacker nothing about the key's state.
 * 5. Scopes are intersected with the current catalogue; a scope string
 *    that is no longer known grants nothing.
 * 6. `last_used_at` is bumped at most once a minute.
 *
 * The presented value is never logged.
 */
@Injectable()
export class ApiKeyAuthService {
  private readonly log = new Logger(ApiKeyAuthService.name);

  constructor(private readonly repo: ApiKeysRepository) {}

  async verify(
    token: string | null | undefined,
    now: Date = new Date(),
  ): Promise<ApiKeyVerifyResult> {
    if (typeof token !== 'string' || token.length === 0) return fail('missing_token');
    if (!looksLikeApiKey(token)) return fail('invalid_token');
    const parsed = parseApiKey(token);
    if (!parsed) return fail('invalid_token');

    const row = await this.repo.findByPrefix(parsed.prefix);
    const presented = Buffer.from(parsed.keyHash, 'hex');
    const stored =
      row && /^[0-9a-f]{64}$/.test(row.keyHash) ? Buffer.from(row.keyHash, 'hex') : DUMMY_HASH;
    const matches = timingSafeEqual(presented, stored) && row !== null && stored !== DUMMY_HASH;
    if (!row || !matches) return fail('invalid_token');

    if (row.revokedAt !== null) return fail('api_key_revoked');
    // A null expiry is never written by the API; fail closed if one exists.
    if (row.expiresAt === null || Date.parse(row.expiresAt) <= now.getTime()) {
      return fail('api_key_expired');
    }

    if (row.lastUsedAt === null || now.getTime() - Date.parse(row.lastUsedAt) >= 60_000) {
      try {
        await this.repo.touchLastUsed(row.id, now);
      } catch (err) {
        // Bookkeeping only; never fail an authenticated call over it.
        this.log.warn(
          `last_used_at update failed key=${row.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return {
      ok: true,
      ownerId: row.ownerId,
      keyId: row.id,
      scopes: row.scopes.filter(isApiKeyScope),
      keyName: row.name,
      keyPrefix: row.prefix,
      requireOwnerApproval: row.requireOwnerApproval,
      allowNewRecipients: row.allowNewRecipients,
      alwaysRequireSignin: row.alwaysRequireSignin,
    };
  }

  /** Extract the bearer value from an `Authorization` header. */
  static bearer(header: string | undefined): string | null {
    if (!header) return null;
    const [scheme, value, extra] = header.split(' ');
    if (scheme !== 'Bearer' || !value || extra !== undefined) return null;
    return value;
  }
}

/** True when the principal holds every required scope. */
export function hasScopes(
  principal: Pick<ApiKeyPrincipal, 'scopes'>,
  required: readonly ApiKeyScope[],
): boolean {
  return required.every((scope) => principal.scopes.includes(scope));
}

function fail(error: ApiKeyAuthError): ApiKeyAuthFailure {
  return { ok: false, error };
}
