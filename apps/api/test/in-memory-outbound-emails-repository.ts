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
}
