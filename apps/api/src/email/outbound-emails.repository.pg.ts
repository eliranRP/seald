import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, sql } from 'kysely';
import type { Database, OutboundEmailsTable } from '../../db/schema';
import { DB_TOKEN } from '../db/db.provider';
import {
  DuplicateOutboundEmailError,
  type InsertOutboundEmailInput,
  OutboundEmailsRepository,
  type OutboundEmailRow,
} from './outbound-emails.repository';

type Row = {
  [K in keyof OutboundEmailsTable]: OutboundEmailsTable[K] extends { __select: infer T }
    ? T
    : OutboundEmailsTable[K];
};

function toDomain(row: Record<string, unknown>): OutboundEmailRow {
  return {
    id: row['id'] as string,
    envelope_id: (row['envelope_id'] as string | null) ?? null,
    signer_id: (row['signer_id'] as string | null) ?? null,
    kind: row['kind'] as OutboundEmailRow['kind'],
    to_email: row['to_email'] as string,
    to_name: row['to_name'] as string,
    payload: row['payload'] as Record<string, unknown>,
    status: row['status'] as OutboundEmailRow['status'],
    attempts: Number(row['attempts']),
    max_attempts: Number(row['max_attempts']),
    scheduled_for: new Date(row['scheduled_for'] as string | Date).toISOString(),
    sent_at: row['sent_at'] ? new Date(row['sent_at'] as string | Date).toISOString() : null,
    last_error: (row['last_error'] as string | null) ?? null,
    provider_id: (row['provider_id'] as string | null) ?? null,
    source_event_id: (row['source_event_id'] as string | null) ?? null,
    created_at: new Date(row['created_at'] as string | Date).toISOString(),
  };
}

/**
 * Detect 23505 unique violation on outbound_emails's (envelope_id, signer_id,
 * kind, source_event_id) index. Real Postgres exposes `constraint` with the
 * name; pg-mem embeds the column tuple in the message. Match both.
 */
function isOutboundUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; constraint?: string; message?: string };
  if (e.code !== '23505') return false;
  if (e.constraint && /outbound_emails/.test(e.constraint)) return true;
  if (typeof e.message === 'string' && /envelope_id.*signer_id.*kind/.test(e.message)) return true;
  if (typeof e.message === 'string' && e.message.includes('outbound_emails')) return true;
  return false;
}

@Injectable()
export class OutboundEmailsPgRepository extends OutboundEmailsRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Kysely<Database>) {
    super();
  }

  async insert(input: InsertOutboundEmailInput): Promise<OutboundEmailRow> {
    try {
      const row = await this.db
        .insertInto('outbound_emails')
        .values({
          envelope_id: input.envelope_id ?? null,
          signer_id: input.signer_id ?? null,
          kind: input.kind,
          to_email: input.to_email,
          to_name: input.to_name,
          payload: JSON.stringify(input.payload),
          source_event_id: input.source_event_id ?? null,
          ...(input.scheduled_for ? { scheduled_for: input.scheduled_for } : {}),
          ...(input.max_attempts !== undefined ? { max_attempts: input.max_attempts } : {}),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return toDomain(row as unknown as Record<string, unknown>);
    } catch (err) {
      if (isOutboundUniqueViolation(err)) throw new DuplicateOutboundEmailError();
      throw err;
    }
  }

  async insertMany(
    inputs: readonly InsertOutboundEmailInput[],
  ): Promise<readonly OutboundEmailRow[]> {
    if (inputs.length === 0) return [];
    try {
      const rows = await this.db
        .insertInto('outbound_emails')
        .values(
          inputs.map((input) => ({
            envelope_id: input.envelope_id ?? null,
            signer_id: input.signer_id ?? null,
            kind: input.kind,
            to_email: input.to_email,
            to_name: input.to_name,
            payload: JSON.stringify(input.payload),
            source_event_id: input.source_event_id ?? null,
            ...(input.scheduled_for ? { scheduled_for: input.scheduled_for } : {}),
            ...(input.max_attempts !== undefined ? { max_attempts: input.max_attempts } : {}),
          })),
        )
        .returningAll()
        .execute();
      return rows.map((r) => toDomain(r as unknown as Record<string, unknown>));
    } catch (err) {
      if (isOutboundUniqueViolation(err)) throw new DuplicateOutboundEmailError();
      throw err;
    }
  }

  async listByEnvelope(envelope_id: string): Promise<readonly OutboundEmailRow[]> {
    const rows = await this.db
      .selectFrom('outbound_emails')
      .selectAll()
      .where('envelope_id', '=', envelope_id)
      .orderBy('created_at', 'asc')
      .execute();
    return rows.map((r) => toDomain(r as unknown as Record<string, unknown>));
  }

  async findLastInviteOrReminder(
    envelope_id: string,
    signer_id: string,
  ): Promise<OutboundEmailRow | null> {
    const row = await this.db
      .selectFrom('outbound_emails')
      .selectAll()
      .where('envelope_id', '=', envelope_id)
      .where('signer_id', '=', signer_id)
      .where((eb) => eb.or([eb('kind', '=', 'invite'), eb('kind', '=', 'reminder')]))
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst();
    return row ? toDomain(row as unknown as Record<string, unknown>) : null;
  }
}

// Reference so ts doesn't complain about unused sql import in future additions
void sql;
void (null as unknown as Row);
