import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import type { Database } from '../../../../db/schema';
import { DB_TOKEN } from '../../../db/db.provider';
import { withAutomationTables, type AutomationsDatabase } from '../../automations.schema';
import {
  EmailCopyRepository,
  type ConsumeStopResult,
  type EmailCopyContext,
  type ReserveSendsResult,
} from './email-copy.repository';

@Injectable()
export class EmailCopyPgRepository extends EmailCopyRepository {
  private readonly db: Kysely<AutomationsDatabase>;

  constructor(@Inject(DB_TOKEN) db: Kysely<Database>) {
    super();
    this.db = withAutomationTables(db);
  }

  async loadContext(input: {
    readonly ownerId: string;
    readonly envelopeId: string | null;
    readonly signerId: string | null;
  }): Promise<EmailCopyContext | null> {
    if (!input.envelopeId) return null;
    const envelope = await this.db
      .selectFrom('envelopes')
      .select(['id', 'title', 'status', 'short_code', 'sender_email', 'sender_name'])
      .where('id', '=', input.envelopeId)
      .where('owner_id', '=', input.ownerId)
      .executeTakeFirst();
    if (!envelope) return null;
    const signer = input.signerId
      ? await this.db
          .selectFrom('envelope_signers')
          .select(['name'])
          .where('id', '=', input.signerId)
          .where('envelope_id', '=', input.envelopeId)
          .executeTakeFirst()
      : undefined;
    return {
      envelope: {
        id: envelope.id,
        title: envelope.title,
        status: envelope.status,
        shortCode: envelope.short_code,
        senderEmail: envelope.sender_email,
        senderName: envelope.sender_name,
      },
      signerName: signer?.name ?? null,
    };
  }

  async suppressedAmong(ownerId: string, emails: readonly string[]): Promise<ReadonlySet<string>> {
    if (emails.length === 0) return new Set();
    const rows = await this.db
      .selectFrom('automation_copy_suppressions')
      .select(['email'])
      .where('owner_id', '=', ownerId)
      .where('email', 'in', [...emails])
      .execute();
    return new Set(rows.map((r) => r.email));
  }

  async reserveSends(input: {
    readonly ownerId: string;
    readonly runId: string;
    readonly emails: readonly string[];
    readonly day: string;
    readonly cap: number;
  }): Promise<ReserveSendsResult> {
    return this.db.transaction().execute(async (trx) => {
      // One writer per owner at a time: the count below is then exact.
      await sql`select pg_advisory_xact_lock(hashtextextended(${`automation_copy:${input.ownerId}`}, 0))`.execute(
        trx,
      );
      const already = await trx
        .selectFrom('automation_copy_sends')
        .select(['email'])
        .where('run_id', '=', input.runId)
        .execute();
      const have = new Set(already.map((r) => r.email));
      const fresh = input.emails.filter((e) => !have.has(e));
      if (fresh.length === 0) return 'reserved';
      const used = await trx
        .selectFrom('automation_copy_sends')
        .select((eb) => eb.fn.countAll<string>().as('n'))
        .where('owner_id', '=', input.ownerId)
        .where('day', '=', input.day)
        .executeTakeFirstOrThrow();
      if (Number(used.n) + fresh.length > input.cap) return 'capped';
      await trx
        .insertInto('automation_copy_sends')
        .values(
          fresh.map((email) => ({
            run_id: input.runId,
            email,
            owner_id: input.ownerId,
            day: input.day,
          })),
        )
        .onConflict((oc) => oc.columns(['run_id', 'email']).doNothing())
        .execute();
      return 'reserved';
    });
  }

  async isSuppressed(ownerId: string, email: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('automation_copy_suppressions')
      .select(['email'])
      .where('owner_id', '=', ownerId)
      .where('email', '=', email)
      .executeTakeFirst();
    return row !== undefined;
  }

  async putStopToken(input: {
    readonly tokenHash: string;
    readonly ownerId: string;
    readonly email: string;
  }): Promise<void> {
    await this.db
      .insertInto('automation_copy_stop_tokens')
      .values({ token_hash: input.tokenHash, owner_id: input.ownerId, email: input.email })
      .onConflict((oc) => oc.column('token_hash').doNothing())
      .execute();
  }

  async peekStopToken(tokenHash: string): Promise<{ readonly email: string } | null> {
    const row = await this.db
      .selectFrom('automation_copy_stop_tokens')
      .select(['email'])
      .where('token_hash', '=', tokenHash)
      .where('used_at', 'is', null)
      .executeTakeFirst();
    return row ? { email: row.email } : null;
  }

  async consumeStopToken(tokenHash: string): Promise<ConsumeStopResult> {
    return this.db.transaction().execute(async (trx): Promise<ConsumeStopResult> => {
      // The conditional update is the single-use gate: only one caller sees a row.
      const spent = await trx
        .updateTable('automation_copy_stop_tokens')
        .set({ used_at: new Date().toISOString() })
        .where('token_hash', '=', tokenHash)
        .where('used_at', 'is', null)
        .returning(['owner_id', 'email'])
        .executeTakeFirst();
      if (!spent) return { kind: 'invalid' };

      await trx
        .insertInto('automation_copy_suppressions')
        .values({ owner_id: spent.owner_id, email: spent.email })
        .onConflict((oc) => oc.columns(['owner_id', 'email']).doNothing())
        .execute();

      const recipes = await trx
        .selectFrom('automations')
        .select(['id', 'config'])
        .where('owner_id', '=', spent.owner_id)
        .where('action', '=', 'email_copy')
        .forUpdate()
        .execute();
      for (const recipe of recipes) {
        const config = asObject(recipe.config);
        const to = Array.isArray(config.to) ? (config.to as unknown[]) : [];
        const kept = to.filter(
          (a) => typeof a !== 'string' || a.trim().toLowerCase() !== spent.email,
        );
        if (kept.length === to.length) continue;
        await trx
          .updateTable('automations')
          .set(
            kept.length === 0
              ? { config: JSON.stringify({ ...config, to: kept }), enabled: false }
              : { config: JSON.stringify({ ...config, to: kept }) },
          )
          .where('id', '=', recipe.id)
          .execute();
      }
      return { kind: 'stopped', email: spent.email };
    });
  }
}

function asObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // fall through
    }
  }
  return {};
}
