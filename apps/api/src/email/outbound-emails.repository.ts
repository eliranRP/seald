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
  readonly scheduled_for?: string;
  readonly max_attempts?: number;
}

/**
 * Port for the `outbound_emails` table. The write side is used by the
 * envelopes service at send/remind time; the read+claim side is used by the
 * worker's email-drain loop (Phase 3e).
 *
 * Uniqueness is enforced at the DB by `(envelope_id, signer_id, kind,
 * source_event_id)` so the same triggering event cannot enqueue the same
 * email to the same signer twice — idempotency safety net for re-entrant
 * service calls.
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

  /** Find the most recent invite/reminder row for this (envelope, signer) — used by reminder throttling. */
  abstract findLastInviteOrReminder(
    envelope_id: string,
    signer_id: string,
  ): Promise<OutboundEmailRow | null>;

  /**
   * Atomically claim one due email (status in pending|failed, scheduled_for
   * <= now, attempts < max_attempts). Flips status to `sending` and bumps
   * `attempts` so concurrent workers never pick the same row.
   *
   * Uses `for update skip locked` so multiple dispatchers can run in
   * parallel without fighting over rows. Returns null when the queue is
   * empty.
   */
  abstract claimNext(now: Date): Promise<OutboundEmailRow | null>;

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
