import { randomUUID } from 'node:crypto';
import {
  assertNoSignerToken,
  DuplicateOutboundEmailError,
  type InsertOutboundEmailInput,
  OutboundEmailsRepository,
  type OutboundEmailRow,
  OUTBOUND_EMAIL_CLAIM_LEASE_MS,
} from '../src/email/outbound-emails.repository';

/** Hermetic in-memory email outbox for e2e tests. Mirrors the PG adapter's
 * unique-key contract: `(envelope_id, signer_id, kind, source_event_id)`
 * and `dedupe_key` when the caller sets one. Null `signer_id` values are
 * treated as equal here; production Postgres does not, which is why
 * sender notices also pass `dedupe_key`.
 */
export class InMemoryOutboundEmailsRepository extends OutboundEmailsRepository {
  readonly rows: OutboundEmailRow[] = [];

  reset(): void {
    this.rows.length = 0;
  }

  async insert(input: InsertOutboundEmailInput): Promise<OutboundEmailRow> {
    assertNoSignerToken(input.payload);
    const dedupeKey = input.dedupe_key ?? randomUUID();
    const dupByKey = input.dedupe_key
      ? this.rows.find((r) => r.dedupe_key === input.dedupe_key)
      : undefined;
    // Postgres treats nulls as distinct in a unique index, so a row with no
    // signer (sender- and recipient-addressed mail) never clashes on the tuple.
    const dupByTuple =
      (input.signer_id ?? null) === null
        ? undefined
        : this.rows.find(
            (r) =>
              r.envelope_id === (input.envelope_id ?? null) &&
              r.signer_id === (input.signer_id ?? null) &&
              r.kind === input.kind &&
              r.source_event_id === (input.source_event_id ?? null),
          );
    if (dupByKey || dupByTuple) throw new DuplicateOutboundEmailError();
    const now = new Date().toISOString();
    const row: OutboundEmailRow = {
      id: randomUUID(),
      envelope_id: input.envelope_id ?? null,
      signer_id: input.signer_id ?? null,
      kind: input.kind,
      to_email: input.to_email,
      to_name: input.to_name,
      payload: { ...input.payload },
      status: 'pending',
      attempts: 0,
      max_attempts: input.max_attempts ?? 8,
      scheduled_for: input.scheduled_for ?? now,
      sent_at: null,
      last_error: null,
      provider_id: null,
      source_event_id: input.source_event_id ?? null,
      dedupe_key: dedupeKey,
      created_at: now,
    };
    this.rows.push(row);
    return row;
  }

  async insertMany(
    inputs: readonly InsertOutboundEmailInput[],
  ): Promise<readonly OutboundEmailRow[]> {
    const out: OutboundEmailRow[] = [];
    for (const i of inputs) out.push(await this.insert(i));
    return out;
  }

  async listByEnvelope(envelope_id: string): Promise<readonly OutboundEmailRow[]> {
    return this.rows
      .filter((r) => r.envelope_id === envelope_id)
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  }

  readonly providerEvents: Array<{
    readonly provider: string;
    readonly event_type: string;
    readonly provider_id: string;
    readonly payload: Readonly<Record<string, unknown>>;
  }> = [];

  async recordProviderEvent(
    provider: string,
    event_type: string,
    provider_id: string,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    this.providerEvents.push({ provider, event_type, provider_id, payload });
  }

  async findByProviderId(provider_id: string): Promise<OutboundEmailRow | null> {
    return this.rows.find((r) => r.provider_id === provider_id) ?? null;
  }

  async findLastInviteOrReminder(
    envelope_id: string,
    signer_id: string,
    options?: { readonly excludeAutomated?: boolean },
  ): Promise<OutboundEmailRow | null> {
    const match = this.rows
      .filter(
        (r) =>
          r.envelope_id === envelope_id &&
          r.signer_id === signer_id &&
          (r.kind === 'invite' || r.kind === 'your_turn' || r.kind === 'reminder') &&
          !(options?.excludeAutomated && r.payload['automated'] === true),
      )
      .sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
    return match[0] ?? null;
  }

  async claimNext(now: Date, envelopeIds?: readonly string[]): Promise<OutboundEmailRow | null> {
    const nowIso = now.toISOString();
    const allowed = envelopeIds && envelopeIds.length > 0 ? new Set(envelopeIds) : null;
    const inScope = (r: OutboundEmailRow): boolean =>
      allowed === null || (r.envelope_id !== null && allowed.has(r.envelope_id));
    // Same as pg: a stale `sending` row with no attempts left gives up.
    this.rows.forEach((r, i) => {
      if (
        r.status === 'sending' &&
        r.scheduled_for <= nowIso &&
        r.attempts >= r.max_attempts &&
        inScope(r)
      ) {
        this.rows[i] = {
          ...r,
          status: 'failed',
          last_error: r.last_error ?? 'claim_lease_expired',
        };
      }
    });
    const due = this.rows
      .filter(
        (r) =>
          (r.status === 'pending' || r.status === 'failed' || r.status === 'sending') &&
          r.scheduled_for <= nowIso &&
          r.attempts < r.max_attempts &&
          (allowed === null || (r.envelope_id !== null && allowed.has(r.envelope_id))),
      )
      .sort((a, b) => (a.scheduled_for < b.scheduled_for ? -1 : 1));
    const picked = due[0];
    if (!picked) return null;
    const idx = this.rows.findIndex((r) => r.id === picked.id);
    const updated: OutboundEmailRow = {
      ...picked,
      status: 'sending',
      attempts: picked.attempts + 1,
      scheduled_for: new Date(now.getTime() + OUTBOUND_EMAIL_CLAIM_LEASE_MS).toISOString(),
    };
    this.rows[idx] = updated;
    return updated;
  }

  async markSent(
    id: string,
    provider_id: string,
    sent_at: Date,
    claimedAttempts?: number,
  ): Promise<void> {
    const idx = this.rows.findIndex((r) => r.id === id);
    if (idx === -1) return;
    const row = this.rows[idx]!;
    if (!stillClaimed(row, claimedAttempts)) return;
    this.rows[idx] = {
      ...row,
      status: 'sent',
      provider_id,
      sent_at: sent_at.toISOString(),
      last_error: null,
    };
  }

  async cancelPendingInvites(
    envelope_id: string,
  ): Promise<{ readonly canceled: number; readonly alreadyHandled: number }> {
    let canceled = 0;
    let alreadyHandled = 0;
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i]!;
      if (row.envelope_id !== envelope_id || (row.kind !== 'invite' && row.kind !== 'your_turn'))
        continue;
      if (row.status === 'pending') {
        this.rows[i] = { ...row, status: 'canceled' };
        canceled++;
      } else if (row.status === 'sending' || row.status === 'sent') {
        alreadyHandled++;
      }
    }
    return { canceled, alreadyHandled };
  }

  async markSkipped(id: string, reason: string, claimedAttempts?: number): Promise<void> {
    const idx = this.rows.findIndex((r) => r.id === id);
    if (idx === -1) return;
    const row = this.rows[idx]!;
    if (!stillClaimed(row, claimedAttempts)) return;
    this.rows[idx] = {
      ...row,
      status: 'failed',
      last_error: reason,
      attempts: row.max_attempts,
    };
  }

  async markFailed(
    id: string,
    args: {
      readonly error: string;
      readonly final: boolean;
      readonly nextAttemptAt?: Date;
      readonly claimedAttempts?: number;
    },
  ): Promise<void> {
    const idx = this.rows.findIndex((r) => r.id === id);
    if (idx === -1) return;
    const row = this.rows[idx]!;
    if (!stillClaimed(row, args.claimedAttempts)) return;
    if (args.final) {
      this.rows[idx] = {
        ...row,
        status: 'failed',
        last_error: args.error,
        attempts: row.max_attempts,
      };
      return;
    }
    this.rows[idx] = {
      ...row,
      status: 'pending',
      last_error: args.error,
      ...(args.nextAttemptAt ? { scheduled_for: args.nextAttemptAt.toISOString() } : {}),
    };
  }
}

/** Mirrors the pg guard: a stale dispatcher cannot write over a newer claim. */
function stillClaimed(row: OutboundEmailRow, claimedAttempts: number | undefined): boolean {
  return (
    claimedAttempts === undefined || (row.status === 'sending' && row.attempts === claimedAttempts)
  );
}
