import type { EmailKindDb, EmailStatusDb } from '../../db/schema';

export interface OutboundEmailRow {
  readonly id: string;
  readonly envelope_id: string | null;
  readonly signer_id: string | null;
  readonly kind: EmailKindDb;
  readonly to_email: string;
  readonly to_name: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly status: EmailStatusDb;
  readonly attempts: number;
  readonly max_attempts: number;
  readonly scheduled_for: string;
  readonly sent_at: string | null;
  readonly last_error: string | null;
  readonly provider_id: string | null;
  readonly source_event_id: string | null;
  readonly dedupe_key: string;
  readonly created_at: string;
}

export interface InsertOutboundEmailInput {
  readonly envelope_id?: string | null;
  readonly signer_id?: string | null;
  readonly kind: EmailKindDb;
  readonly to_email: string;
  readonly to_name: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly source_event_id?: string | null;
  /**
   * When set, a second insert with the same key is a duplicate. Use a
   * stable value (`signed_to_sender:<envelope>:<signer>`,
   * `completed:<envelope>:<email>`). Omit it for one-shot rows; the
   * column default assigns a fresh id.
   */
  readonly dedupe_key?: string;
  readonly scheduled_for?: string;
  readonly max_attempts?: number;
}

/**
 * Port for the `outbound_emails` table. The write side is used by the
 * envelopes service at send/remind time; the read+claim side is used by the
 * worker's email-drain loop (Phase 3e).
 *
 * Insert A: invite and reminder rows store the signer id only. No payload
 * may hold a signing token or a `?t=` link (`assertNoSignerToken`); the
 * dispatcher mints a fresh token per attempt and renders the link.
 *
 * Uniqueness is enforced at the DB by `(envelope_id, signer_id, kind,
 * source_event_id)` and by `dedupe_key` (migration 0019). The tuple does
 * not cover sender-addressed rows (`signer_id` is null — Postgres treats
 * those nulls as distinct). Callers that must send once pass `dedupe_key`.
 */
export abstract class OutboundEmailsRepository {
  /** Insert a single row. Returns the created row. Throws on duplicate-unique. */
  abstract insert(input: InsertOutboundEmailInput): Promise<OutboundEmailRow>;

  /** Batch insert — atomic success/fail. Worker-path helpers not needed for sender flow. */
  abstract insertMany(
    inputs: readonly InsertOutboundEmailInput[],
  ): Promise<readonly OutboundEmailRow[]>;

  /** Fetch by envelope (ordered by created_at asc). Used by sender's audit view + tests. */
  abstract listByEnvelope(envelope_id: string): Promise<readonly OutboundEmailRow[]>;

  /**
   * Newest invite or reminder for this signer.
   * Pass `excludeAutomated` for the manual hourly throttle so a daily
   * automated reminder does not consume that limit.
   */
  abstract findLastInviteOrReminder(
    envelope_id: string,
    signer_id: string,
    options?: { readonly excludeAutomated?: boolean },
  ): Promise<OutboundEmailRow | null>;

  /**
   * The outbox row the email provider reported on, by its provider message
   * id (`provider_id`). Null when no row carries it.
   */
  abstract findByProviderId(provider_id: string): Promise<OutboundEmailRow | null>;

  /**
   * Keep a provider webhook event in `email_webhooks`, keyed by the
   * provider message id. The MCP send guard counts bounces and complaints
   * from it. Telemetry only.
   */
  abstract recordProviderEvent(
    provider: string,
    event_type: string,
    provider_id: string,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<void>;

  /**
   * Atomically claim one due email (status in pending|failed, scheduled_for
   * <= now, attempts < max_attempts). Flips status to `sending` and bumps
   * `attempts` so concurrent workers never pick the same row.
   *
   * Uses `for update skip locked` so multiple dispatchers can run in
   * parallel without fighting over rows. Returns null when the queue is
   * empty. `envelopeIds` limits the claim to those envelopes so a test
   * drain cannot take another session's pending rows.
   */
  abstract claimNext(now: Date, envelopeIds?: readonly string[]): Promise<OutboundEmailRow | null>;

  /** Mark a claimed row as delivered. */
  abstract markSent(id: string, provider_id: string, sent_at: Date): Promise<void>;

  /**
   * Mark a claimed row as failed. When `final=true` the row stays `failed`
   * indefinitely; when `final=false` the row flips back to `pending` with
   * a future `scheduled_for` (caller computes exponential backoff) so the
   * drain loop can retry later.
   */
  abstract markFailed(
    id: string,
    args: {
      readonly error: string;
      readonly final: boolean;
      readonly nextAttemptAt?: Date;
    },
  ): Promise<void>;

  /**
   * Stop a claimed row without sending it. `email_status` has no skipped
   * value, so this records `failed` with `attempts = max_attempts` and
   * `last_error` set to `reason`. The drain loop will not claim it again.
   */
  abstract markSkipped(id: string, reason: string): Promise<void>;

  /**
   * Undo after Send: flip every still-`pending` invite of the envelope to
   * `canceled`, so the drain loop never claims it. Rows already claimed or
   * sent are left alone and counted, so the caller can record both in the
   * audit event.
   */
  abstract cancelPendingInvites(
    envelope_id: string,
  ): Promise<{ readonly canceled: number; readonly alreadyHandled: number }>;
}

/**
 * Payload keys that held a plaintext signing link before Insert A
 * (migration 0027). The migration scrubs them from stored rows; the
 * dispatcher still drops them defensively and mints a new token instead.
 */
export const LEGACY_SIGNER_LINK_KEYS: readonly string[] = ['sign_url'];

/**
 * A signing link that carries a token-shaped value: `/sign/…?t=<32+
 * base64url chars>` (real tokens are 43). Scoped to `/sign/` and a long
 * value so user text such as a title "Lease?t=final" never matches. Kept
 * in step with the 0027 check constraint.
 *
 * Hand-written single pass instead of a regex: payloads include user text,
 * and `/\/sign\/[^"\s]*[?&]t=…/` backtracks in polynomial time on input that
 * repeats `/sign/` (CodeQL js/polynomial-redos). Each `/sign/` run up to
 * the next quote or whitespace is scanned once, then skipped.
 */
const SIGN_PATH = '/sign/';
const MIN_TOKEN_CHARS = 32;
const BASE64URL_CHAR = /[A-Za-z0-9_-]/;

function isLinkTerminator(ch: string): boolean {
  return ch === '"' || /\s/.test(ch);
}

export function containsSigningLinkWithToken(text: string): boolean {
  let from = 0;
  for (;;) {
    const start = text.indexOf(SIGN_PATH, from);
    if (start === -1) return false;
    let end = start + SIGN_PATH.length;
    while (end < text.length && !isLinkTerminator(text.charAt(end))) end += 1;
    for (let i = start + SIGN_PATH.length; i + 2 < end; i += 1) {
      const sep = text.charAt(i);
      if (
        (sep === '?' || sep === '&') &&
        text.charAt(i + 1) === 't' &&
        text.charAt(i + 2) === '='
      ) {
        let run = 0;
        let j = i + 3;
        while (j < end && BASE64URL_CHAR.test(text.charAt(j))) {
          run += 1;
          j += 1;
        }
        if (run >= MIN_TOKEN_CHARS) return true;
      }
    }
    from = end;
  }
}

/**
 * Insert A: an outbound payload holds ids only, never a signer token or a
 * `/sign/…?t=` link. The worker mints the token at dispatch. Returns a short
 * reason when `payload` breaks that rule, else null. Checked on every
 * insert and enforced again by the 0027 check constraint.
 */
export function findSignerTokenInPayload(
  payload: Readonly<Record<string, unknown>>,
): string | null {
  for (const key of LEGACY_SIGNER_LINK_KEYS) {
    if (key in payload) return `payload_key:${key}`;
  }
  if (containsSigningLinkWithToken(JSON.stringify(payload))) return 'payload_signing_link';
  return null;
}

/** Payload with any legacy plaintext signing link removed. */
export function withoutSignerLink(
  payload: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...payload };
  for (const key of LEGACY_SIGNER_LINK_KEYS) delete out[key];
  return out;
}

/** Thrown when a caller tries to store a signer token in the outbox. */
export class SignerTokenInPayloadError extends Error {
  constructor(reason: string) {
    super(`signer_token_in_outbound_payload:${reason}`);
    this.name = 'SignerTokenInPayloadError';
  }
}

/** Throw {@link SignerTokenInPayloadError} if `payload` carries a signer token. */
export function assertNoSignerToken(payload: Readonly<Record<string, unknown>>): void {
  const reason = findSignerTokenInPayload(payload);
  if (reason) throw new SignerTokenInPayloadError(reason);
}

/**
 * Domain error thrown on (envelope_id, signer_id, kind, source_event_id)
 * unique violation. Service translates to an idempotent success (no HTTP
 * error) because a duplicate means the caller already did this work.
 */
export class DuplicateOutboundEmailError extends Error {
  constructor() {
    super('duplicate_outbound_email');
    this.name = 'DuplicateOutboundEmailError';
  }
}
