import { createHash } from 'node:crypto';
import type { EnvelopeEvent } from './envelope.entity';

/**
 * Tamper-evident audit-chain hashing.
 *
 * Each row in envelope_events stores `prev_event_hash` = SHA-256 of the
 * previous row's *canonical JSON* (per-envelope chain, ordered by
 * created_at). Walking the chain and recomputing the hash detects any
 * mutation (insert / update / delete) of the underlying event log — even
 * by an actor with direct DB write access — because the next row's stored
 * hash will no longer match the recomputed value.
 *
 * The canonical-JSON contract is the *only* thing that matters here; both
 * the insert path (envelopes.repository.pg.ts -> appendEvent) and the
 * verify path (verify.controller.ts) MUST hash exactly the same bytes,
 * or every freshly-written row would already report broken. We achieve
 * that by:
 *
 *   1. Restricting the hashed fields to a fixed, ordered list (id,
 *      envelope_id, signer_id, actor_kind, event_type, ip, user_agent,
 *      metadata, created_at).
 *   2. Sorting JSON object keys recursively (so `metadata: {b:1,a:2}` and
 *      `metadata: {a:2,b:1}` hash identically).
 *   3. Always feeding `created_at` as the ISO-string we surface on the
 *      domain type (rather than a DB Date) — adapters convert at the
 *      boundary already, so the value matches what verify() walks.
 */

export type CanonicalEventInput = Pick<
  EnvelopeEvent,
  | 'id'
  | 'envelope_id'
  | 'signer_id'
  | 'actor_kind'
  | 'event_type'
  | 'ip'
  | 'user_agent'
  | 'metadata'
  | 'created_at'
>;

/**
 * Canonical JSON: deterministic key order, no insignificant whitespace.
 *
 * Top-level field order is the documented contract (id, envelope_id,
 * signer_id, actor_kind, event_type, ip, user_agent, metadata,
 * created_at). The metadata subobject — which is `Record<string, unknown>`
 * — is recursively key-sorted so `{b:1,a:2}` and `{a:2,b:1}` hash
 * identically.
 *
 * Both the insert path (envelopes.repository.pg.ts -> appendEvent)
 * and the verify path (verify.controller.ts) MUST hash exactly these
 * bytes, or every freshly-written row would already report broken.
 */
export function canonicalJson(event: CanonicalEventInput): string {
  const ordered = {
    id: event.id,
    envelope_id: event.envelope_id,
    signer_id: event.signer_id,
    actor_kind: event.actor_kind,
    event_type: event.event_type,
    ip: event.ip,
    user_agent: event.user_agent,
    metadata: sortKeysDeep(event.metadata),
    created_at: event.created_at,
  };
  // No replacer — the top-level order comes from the literal above and
  // `metadata` was deep-sorted before insertion. JSON.stringify
  // preserves insertion order for object literals (ES2015 spec).
  return JSON.stringify(ordered);
}

/**
 * Recursively key-sort an arbitrary JSON-shaped value. Used for the
 * metadata subobject so structural permutations (`{a,b}` vs `{b,a}`)
 * hash identically. Arrays are passed through as-is — the spec is
 * about *object* canonicalization, not array order.
 */
function sortKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => sortKeysDeep(v));
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    out[k] = sortKeysDeep(obj[k]);
  }
  return out;
}

export function eventHash(event: CanonicalEventInput): Buffer {
  return createHash('sha256').update(canonicalJson(event), 'utf8').digest();
}
