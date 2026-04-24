import { randomUUID } from 'node:crypto';
import {
  DuplicateOutboundEmailError,
  type InsertOutboundEmailInput,
  OutboundEmailsRepository,
  type OutboundEmailRow,
} from '../src/email/outbound-emails.repository';

/** Hermetic in-memory email outbox for e2e tests. Mirrors the PG adapter's
 * unique-key contract: `(envelope_id, signer_id, kind, source_event_id)`.
 */
export class InMemoryOutboundEmailsRepository extends OutboundEmailsRepository {
  readonly rows: OutboundEmailRow[] = [];

  reset(): void {
    this.rows.length = 0;
  }

  async insert(input: InsertOutboundEmailInput): Promise<OutboundEmailRow> {
    const dup = this.rows.find(
      (r) =>
        r.envelope_id === (input.envelope_id ?? null) &&
        r.signer_id === (input.signer_id ?? null) &&
        r.kind === input.kind &&
        r.source_event_id === (input.source_event_id ?? null),
    );
    if (dup) throw new DuplicateOutboundEmailError();
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

  async findLastInviteOrReminder(
    envelope_id: string,
    signer_id: string,
  ): Promise<OutboundEmailRow | null> {
    const match = this.rows
      .filter(
        (r) =>
          r.envelope_id === envelope_id &&
          r.signer_id === signer_id &&
          (r.kind === 'invite' || r.kind === 'reminder'),
      )
      .sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
    return match[0] ?? null;
  }

  async claimNext(now: Date): Promise<OutboundEmailRow | null> {
    const nowIso = now.toISOString();
    const due = this.rows
      .filter(
        (r) =>
          (r.status === 'pending' || r.status === 'failed') &&
          r.scheduled_for <= nowIso &&
          r.attempts < r.max_attempts,
      )
      .sort((a, b) => (a.scheduled_for < b.scheduled_for ? -1 : 1));
    const picked = due[0];
    if (!picked) return null;
    const idx = this.rows.findIndex((r) => r.id === picked.id);
    const updated: OutboundEmailRow = {
      ...picked,
      status: 'sending',
      attempts: picked.attempts + 1,
    };
    this.rows[idx] = updated;
    return updated;
  }

  async markSent(id: string, provider_id: string, sent_at: Date): Promise<void> {
    const idx = this.rows.findIndex((r) => r.id === id);
    if (idx === -1) return;
    const row = this.rows[idx]!;
    this.rows[idx] = {
      ...row,
      status: 'sent',
      provider_id,
      sent_at: sent_at.toISOString(),
      last_error: null,
    };
  }

  async markFailed(
    id: string,
    args: {
      readonly error: string;
      readonly final: boolean;
      readonly nextAttemptAt?: Date;
    },
  ): Promise<void> {
    const idx = this.rows.findIndex((r) => r.id === id);
    if (idx === -1) return;
    const row = this.rows[idx]!;
    if (args.final) {
      this.rows[idx] = { ...row, status: 'failed', last_error: args.error };
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
