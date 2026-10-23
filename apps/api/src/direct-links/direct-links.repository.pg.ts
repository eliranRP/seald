import { Inject, Injectable } from '@nestjs/common';
import type { Kysely, Selectable } from 'kysely';
import { sql } from 'kysely';
import type { Database, TemplateDirectLinksTable } from '../../db/schema';
import { DB_TOKEN } from '../db/db.provider';
import {
  DirectLinkExistsError,
  DirectLinksRepository,
  type CreateDirectLinkRow,
  type DirectLinkPatch,
  type DirectLinkRecord,
  type EnvelopeProvenance,
  type ReserveClaimResult,
} from './direct-links.repository';

type Row = Selectable<TemplateDirectLinksTable>;

const DAY_MS = 24 * 60 * 60 * 1000;

function toRecord(r: Row): DirectLinkRecord {
  return {
    id: r.id,
    template_id: r.template_id,
    owner_id: r.owner_id,
    prefix: r.prefix,
    signer_slot: r.signer_slot,
    enabled: r.enabled,
    daily_cap: r.daily_cap,
    sender_name: r.sender_name,
    sender_email: r.sender_email,
    created_at: new Date(r.created_at),
    updated_at: new Date(r.updated_at),
  };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

@Injectable()
export class DirectLinksPgRepository extends DirectLinksRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Kysely<Database>) {
    super();
  }

  async findLiveByTemplate(
    owner_id: string,
    template_id: string,
  ): Promise<DirectLinkRecord | null> {
    const row = await this.db
      .selectFrom('template_direct_links')
      .selectAll()
      .where('owner_id', '=', owner_id)
      .where('template_id', '=', template_id)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    return row ? toRecord(row) : null;
  }

  async findLiveByTokenHash(token_hash: string): Promise<DirectLinkRecord | null> {
    const row = await this.db
      .selectFrom('template_direct_links')
      .selectAll()
      .where('token_hash', '=', token_hash)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    return row ? toRecord(row) : null;
  }

  async create(input: CreateDirectLinkRow): Promise<DirectLinkRecord> {
    try {
      const row = await this.db
        .insertInto('template_direct_links')
        .values({
          template_id: input.template_id,
          owner_id: input.owner_id,
          token_hash: input.token_hash,
          prefix: input.prefix,
          signer_slot: input.signer_slot,
          daily_cap: input.daily_cap,
          sender_name: input.sender_name,
          sender_email: input.sender_email,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return toRecord(row);
    } catch (err) {
      if (isUniqueViolation(err)) throw new DirectLinkExistsError();
      throw err;
    }
  }

  async update(
    owner_id: string,
    template_id: string,
    patch: DirectLinkPatch,
  ): Promise<DirectLinkRecord | null> {
    const set: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.enabled !== undefined) set['enabled'] = patch.enabled;
    if (patch.signer_slot !== undefined) set['signer_slot'] = patch.signer_slot;
    if (patch.daily_cap !== undefined) set['daily_cap'] = patch.daily_cap;
    if (patch.sender_name !== undefined) set['sender_name'] = patch.sender_name;
    if (patch.sender_email !== undefined) set['sender_email'] = patch.sender_email;
    const row = await this.db
      .updateTable('template_direct_links')
      .set(set)
      .where('owner_id', '=', owner_id)
      .where('template_id', '=', template_id)
      .where('revoked_at', 'is', null)
      .returningAll()
      .executeTakeFirst();
    return row ? toRecord(row) : null;
  }

  async rotate(
    owner_id: string,
    template_id: string,
    next: {
      readonly token_hash: string;
      readonly prefix: string;
      readonly sender_email: string | null;
    },
  ): Promise<DirectLinkRecord | null> {
    return this.db.transaction().execute(async (trx) => {
      const old = await trx
        .selectFrom('template_direct_links')
        .selectAll()
        .where('owner_id', '=', owner_id)
        .where('template_id', '=', template_id)
        .where('revoked_at', 'is', null)
        .forUpdate()
        .executeTakeFirst();
      if (!old) return null;
      await trx
        .updateTable('template_direct_links')
        .set({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .where('id', '=', old.id)
        .execute();
      const row = await trx
        .insertInto('template_direct_links')
        .values({
          template_id,
          owner_id,
          token_hash: next.token_hash,
          prefix: next.prefix,
          signer_slot: old.signer_slot,
          enabled: old.enabled,
          daily_cap: old.daily_cap,
          sender_name: old.sender_name,
          sender_email: next.sender_email ?? old.sender_email,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return toRecord(row);
    });
  }

  async revoke(owner_id: string, template_id: string): Promise<boolean> {
    const res = await this.db
      .updateTable('template_direct_links')
      .set({
        revoked_at: new Date().toISOString(),
        enabled: false,
        updated_at: new Date().toISOString(),
      })
      .where('owner_id', '=', owner_id)
      .where('template_id', '=', template_id)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    return (res?.numUpdatedRows ?? 0n) > 0n;
  }

  async countRecentClaims(link_id: string, now: Date): Promise<number> {
    const since = new Date(now.getTime() - DAY_MS).toISOString();
    const row = await this.db
      .selectFrom('template_direct_link_claims')
      .select(sql<string>`count(*)`.as('n'))
      .where('link_id', '=', link_id)
      .where('created_at', '>', since as never)
      .executeTakeFirst();
    return Number(row?.n ?? 0);
  }

  async reserveClaim(input: {
    readonly link_id: string;
    readonly email_hash: string;
    readonly daily_cap: number;
    readonly now: Date;
  }): Promise<ReserveClaimResult> {
    return this.db.transaction().execute(async (trx) => {
      // One writer per link at a time, so the count and the insert below
      // cannot interleave with another claim for the same link.
      await sql`select pg_advisory_xact_lock(hashtext(${'direct_link:' + input.link_id}))`.execute(
        trx,
      );
      const since = new Date(input.now.getTime() - DAY_MS).toISOString();
      const dup = await trx
        .selectFrom('template_direct_link_claims')
        .select('id')
        .where('link_id', '=', input.link_id)
        .where('email_hash', '=', input.email_hash)
        .where('created_at', '>', since as never)
        .executeTakeFirst();
      if (dup) return { kind: 'duplicate' } as const;
      const count = await trx
        .selectFrom('template_direct_link_claims')
        .select(sql<string>`count(*)`.as('n'))
        .where('link_id', '=', input.link_id)
        .where('created_at', '>', since as never)
        .executeTakeFirst();
      if (Number(count?.n ?? 0) >= input.daily_cap) return { kind: 'cap_reached' } as const;
      const row = await trx
        .insertInto('template_direct_link_claims')
        .values({ link_id: input.link_id, email_hash: input.email_hash })
        .returning('id')
        .executeTakeFirstOrThrow();
      return { kind: 'reserved', claim_id: row.id } as const;
    });
  }

  async releaseClaim(claim_id: string): Promise<void> {
    await this.db.deleteFrom('template_direct_link_claims').where('id', '=', claim_id).execute();
  }

  async attachEnvelope(claim_id: string, p: EnvelopeProvenance): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('template_direct_link_claims')
        .set({ envelope_id: p.envelope_id })
        .where('id', '=', claim_id)
        .execute();
      await trx
        .updateTable('envelopes')
        .set({
          source: 'direct_link',
          direct_link_id: p.direct_link_id,
          source_template_id: p.template_id,
        })
        .where('id', '=', p.envelope_id)
        .execute();
    });
  }
}
