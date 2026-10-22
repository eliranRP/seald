import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { canonicalJsonValue } from '../envelopes/event-hash';
import { IdempotencyRecordsRepository } from './idempotency-records.repository';

/** The doc's TTL: a stored response replays for 24 hours. */
export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

/**
 * A claim with no stored response after this long belongs to a call that
 * died (the API's request timeout is 30 seconds). A retry with the same
 * request may then run again.
 */
export const IDEMPOTENCY_STALE_CLAIM_SECONDS = 120;

export interface IdempotencyScope {
  /** `idempotency_records.user_id`: the account owner. */
  readonly ownerId: string;
  /** Prefix that keeps credentials apart, e.g. `mcp:<key_id>`. */
  readonly namespace: string;
  /** The client's own key (8–200 chars, checked by the tool schema). */
  readonly clientKey: string;
  /** `idempotency_records.method`, `MCP` for tools. */
  readonly method: string;
  /** `idempotency_records.path`, the tool name for MCP. */
  readonly path: string;
  /** The call arguments; `idempotency_key` is left out of the hash. */
  readonly args: Readonly<Record<string, unknown>>;
}

export type IdempotencyBegin =
  /** Run the call, then `complete` or `release`. */
  | { readonly kind: 'run'; readonly handle: IdempotencyHandle }
  /** Same key, same request, already done: return the stored body. */
  | { readonly kind: 'replay'; readonly body: unknown }
  /** Same key, different request (or a different tool). */
  | { readonly kind: 'conflict' }
  /** Same key and request, still running in another call. */
  | { readonly kind: 'in_progress' };

export interface IdempotencyHandle {
  readonly userId: string;
  readonly storedKey: string;
}

/**
 * Idempotency keys for MCP write tools (docs/design/mcp-server.md § Rate
 * limits, idempotency, errors; step 8a). Reuses `idempotency_records`:
 *
 * - The stored key is `<namespace>:<client key>` (`mcp:<key_id>:…`), so
 *   two API keys cannot collide and a key cannot replay a SPA write.
 * - `request_hash` is SHA-256 of the tool name plus the canonical JSON of
 *   the arguments without `idempotency_key`.
 * - Matching hash and a stored response: replay. Different hash (or a
 *   different tool under the same key): `idempotency_conflict`.
 * - TTL 24 hours. Account deletion removes the rows (`deleteByUser`).
 *
 * The key is claimed before the tool runs and completed after it, in
 * separate statements: the envelope services open their own
 * transactions, so the row cannot share the mutation's transaction. A
 * claim left by a crashed call goes stale after two minutes, and then
 * the same request runs again. See the WP-19 report.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly repo: IdempotencyRecordsRepository) {}

  static requestHash(path: string, args: Readonly<Record<string, unknown>>): string {
    const { idempotency_key: _key, ...rest } = args;
    return createHash('sha256')
      .update(`${path}\n${canonicalJsonValue(rest)}`, 'utf8')
      .digest('hex');
  }

  async begin(scope: IdempotencyScope): Promise<IdempotencyBegin> {
    const storedKey = `${scope.namespace}:${scope.clientKey}`;
    const request_hash = IdempotencyService.requestHash(scope.path, scope.args);
    const outcome = await this.repo.claim({
      user_id: scope.ownerId,
      idempotency_key: storedKey,
      method: scope.method,
      path: scope.path,
      request_hash,
      ttl_seconds: IDEMPOTENCY_TTL_SECONDS,
      stale_claim_seconds: IDEMPOTENCY_STALE_CLAIM_SECONDS,
    });
    if (outcome.claimed) {
      return { kind: 'run', handle: { userId: scope.ownerId, storedKey } };
    }
    const existing = outcome.existing;
    if (existing.request_hash !== request_hash || existing.path !== scope.path) {
      return { kind: 'conflict' };
    }
    if (existing.completed_at === null) return { kind: 'in_progress' };
    return { kind: 'replay', body: existing.response_body };
  }

  async complete(handle: IdempotencyHandle, body: unknown): Promise<void> {
    await this.repo.complete(handle.userId, handle.storedKey, 200, body);
  }

  async release(handle: IdempotencyHandle): Promise<void> {
    await this.repo.release(handle.userId, handle.storedKey);
  }
}
