import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type RawBuilder, type Selectable, type Transaction } from 'kysely';
import { ApprovalSummarySchema, isApprovalKind, type ApprovalSummary } from 'shared';
import type { Database, McpApprovalsTable } from '../../db/schema';
import { DB_TOKEN } from '../db/db.provider';
import { insertOutboundEmailIdempotent } from '../email/insert-idempotent';
import { OutboundEmailsPgRepository } from '../email/outbound-emails.repository.pg';
import {
  EXECUTION_STALE_MS,
  matchToken,
  planAgentRepreview,
  type ApprovalRecord,
  type TokenMatch,
} from './approval-state';
import {
  ApprovalsRepository,
  type ApprovalKeyFacts,
  type ClaimDecisionInput,
  type ConsumeConfirmationInput,
  type InsertConfirmationInput,
  type ListApprovalsInput,
  type OpenApprovalInput,
  type OpenApprovalResult,
  type OwnerEditInput,
  type OwnerMailbox,
} from './approvals.repository';

type Row = Selectable<McpApprovalsTable>;
type Db = Kysely<Database> | Transaction<Database>;

function iso(value: Date | string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function parseSummary(raw: unknown): ApprovalSummary {
  const parsed = ApprovalSummarySchema.safeParse(raw);
  if (!parsed.success) throw new Error('mcp_approvals.summary is malformed');
  return parsed.data;
}

function toApprovalRecord(row: Row): ApprovalRecord {
  if (!isApprovalKind(row.action)) throw new Error(`unknown approval action ${row.action}`);
  return {
    id: row.id,
    ownerId: row.owner_id,
    apiKeyId: row.api_key_id,
    oauthGrantId: row.oauth_grant_id,
    kind: row.action,
    tool: row.tool,
    subjectKey: row.subject_key,
    envelopeId: row.envelope_id,
    args: row.args,
    summary: parseSummary(row.summary),
    subjectHash: row.subject_hash,
    linkTokenHash: row.link_token_hash,
    previousTokenHash: row.previous_token_hash,
    priorTokenHashes: [...row.prior_token_hashes],
    notify: row.notify,
    approveRequires: row.approve_requires,
    ownerEditedAt: iso(row.owner_edited_at),
    expiresAt: new Date(row.expires_at).toISOString(),
    approvedAt: iso(row.approved_at),
    deniedAt: iso(row.denied_at),
    failedAt: iso(row.failed_at),
    expiredAt: iso(row.expired_at),
    completedAt: iso(row.completed_at),
    expiredReason: row.expired_reason,
    decidedVia: row.decided_via,
    resultSlug: row.result_slug,
    result: row.result,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/** No decision, failure or expiry recorded, and inside the 24 hours. */
function openAt(now: Date): RawBuilder<boolean> {
  return sql<boolean>`(approved_at is null and denied_at is null and failed_at is null
    and expired_at is null and expires_at > ${now.toISOString()}::timestamptz)`;
}

function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** The per-owner lock every approval write of that owner takes. */
async function lockOwner(trx: Transaction<Database>, ownerId: string): Promise<void> {
  await sql`select pg_advisory_xact_lock(hashtextextended(${`mcp_approvals:${ownerId}`}, 0))`.execute(
    trx,
  );
}

async function requestMailsToday(trx: Db, ownerId: string, now: Date): Promise<number> {
  const result = await sql<{ n: number }>`
    select count(*)::int as n
      from public.outbound_emails o
      join public.mcp_approvals a on a.id::text = o.payload->>'approval_id'
     where o.kind = 'approval_request'
       and a.owner_id = ${ownerId}::uuid
       and o.created_at >= ${utcDayStart(now).toISOString()}::timestamptz`.execute(trx);
  return result.rows[0]?.n ?? 0;
}

@Injectable()
export class ApprovalsPgRepository extends ApprovalsRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Kysely<Database>) {
    super();
  }

  async findKeyFacts(apiKeyId: string): Promise<ApprovalKeyFacts | null> {
    const row = await this.db
      .selectFrom('api_keys')
      .select([
        'id',
        'owner_id',
        'name',
        'prefix',
        'revoked_at',
        'expires_at',
        'always_require_signin',
        'allow_new_recipients',
        'approval_notify',
      ])
      .where('id', '=', apiKeyId)
      .executeTakeFirst();
    if (!row) return null;
    return {
      id: row.id,
      ownerId: row.owner_id,
      name: row.name,
      prefix: row.prefix,
      revokedAt: iso(row.revoked_at),
      expiresAt: iso(row.expires_at),
      alwaysRequireSignin: row.always_require_signin,
      allowNewRecipients: row.allow_new_recipients,
      approvalNotify: row.approval_notify,
    };
  }

  async findOwnerMailbox(ownerId: string): Promise<OwnerMailbox | null> {
    // `auth.users` is Supabase's table. `to_jsonb` reads
    // `email_confirmed_at` without failing on a schema that lacks it
    // (a bare test schema): no column means not verified.
    const result = await sql<{ email: string | null; confirmed: string | null }>`
      select u.email::text as email, to_jsonb(u)->>'email_confirmed_at' as confirmed
        from auth.users u
       where u.id = ${ownerId}::uuid`.execute(this.db);
    const row = result.rows[0];
    if (!row) return null;
    const email = row.email !== null && row.email.length > 0 ? row.email : null;
    return { email, verified: email !== null && row.confirmed !== null };
  }

  async findKnownRecipients(ownerId: string, emails: readonly string[]): Promise<Set<string>> {
    const wanted = [...new Set(emails.map((e) => e.trim().toLowerCase()))];
    if (wanted.length === 0) return new Set();
    // Known: an envelope of this owner that went out to the address, sent
    // from the web app (its `sent` event has no `metadata.mcp`) or sent
    // after an owner-approved `envelope_send`.
    const result = await sql<{ email: string }>`
      select distinct lower(s.email::text) as email
        from public.envelope_signers s
        join public.envelopes e on e.id = s.envelope_id
       where e.owner_id = ${ownerId}::uuid
         and e.sent_at is not null
         and lower(s.email::text) = any(${wanted}::text[])
         and (
           not exists (
             select 1 from public.envelope_events ev
              where ev.envelope_id = e.id
                and ev.event_type = 'sent'
                and ev.metadata ? 'mcp'
           )
           or exists (
             select 1 from public.mcp_approvals a
              where a.envelope_id = e.id
                and a.action = 'envelope_send'
                and a.completed_at is not null
           )
         )`.execute(this.db);
    return new Set(result.rows.map((r) => r.email));
  }

  async openOrRepreview(input: OpenApprovalInput): Promise<OpenApprovalResult> {
    return this.db.transaction().execute(async (trx) => {
      await lockOwner(trx, input.ownerId);
      const now = input.now.toISOString();

      // A stale row for the same subject is never revived: stamp it expired
      // so the partial unique index lets a new row in.
      await trx
        .updateTable('mcp_approvals')
        .set({ expired_at: now, expired_reason: 'ttl', updated_at: now })
        .where('owner_id', '=', input.ownerId)
        .where('action', '=', input.kind)
        .where('subject_key', '=', input.subjectKey)
        .where('approved_at', 'is', null)
        .where('denied_at', 'is', null)
        .where('failed_at', 'is', null)
        .where('expired_at', 'is', null)
        .where('expires_at', '<=', input.now)
        .execute();

      const open = await trx
        .selectFrom('mcp_approvals')
        .selectAll()
        .where('owner_id', '=', input.ownerId)
        .where('action', '=', input.kind)
        .where('subject_key', '=', input.subjectKey)
        .where('approved_at', 'is', null)
        .where('denied_at', 'is', null)
        .where('failed_at', 'is', null)
        .where('expired_at', 'is', null)
        .forUpdate()
        .executeTakeFirst();

      const mailCapReached = async (): Promise<boolean> =>
        input.email !== null &&
        (await requestMailsToday(trx, input.ownerId, input.now)) >= input.maxMailsPerOwnerPerDay;

      if (open) {
        const current = toApprovalRecord(open);
        const plan = planAgentRepreview(current, input.subjectHash, input.now);
        if (plan.kind === 'unchanged') return { outcome: 'unchanged', record: current };
        if (await mailCapReached()) return { outcome: 'limit_mail' };
        const updated = await trx
          .updateTable('mcp_approvals')
          .set({
            subject_hash: plan.subjectHash,
            summary: JSON.stringify(input.summary),
            args: JSON.stringify(input.args),
            approve_requires: input.approveRequires,
            notify: input.notify,
            link_token_hash: null,
            previous_token_hash: null,
            prior_token_hashes: [...plan.priorTokenHashes],
            expires_at: plan.expiresAt,
            updated_at: now,
          })
          .where('id', '=', current.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        const record = toApprovalRecord(updated);
        if (input.email) {
          await insertOutboundEmailIdempotent(
            new OutboundEmailsPgRepository(trx),
            input.email(record, `approval_request:${record.id}:${record.subjectHash}`),
          );
        }
        return { outcome: 'repreviewed', record };
      }

      if (input.apiKeyId !== null) {
        const counted = await sql<{ n: number }>`
          select count(*)::int as n from public.mcp_approvals
           where api_key_id = ${input.apiKeyId}::uuid and ${openAt(input.now)}`.execute(trx);
        if ((counted.rows[0]?.n ?? 0) >= input.maxOpenPerKey) return { outcome: 'limit_open' };
      }
      if (await mailCapReached()) return { outcome: 'limit_mail' };

      const inserted = await trx
        .insertInto('mcp_approvals')
        .values({
          owner_id: input.ownerId,
          api_key_id: input.apiKeyId,
          oauth_grant_id: input.oauthGrantId,
          action: input.kind,
          tool: input.tool,
          subject_key: input.subjectKey,
          envelope_id: input.envelopeId,
          args: JSON.stringify(input.args),
          summary: JSON.stringify(input.summary),
          subject_hash: input.subjectHash,
          approve_requires: input.approveRequires,
          notify: input.notify,
          expires_at: input.expiresAt,
          created_at: now,
          updated_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      const record = toApprovalRecord(inserted);
      if (input.email) {
        await insertOutboundEmailIdempotent(
          new OutboundEmailsPgRepository(trx),
          input.email(record, `approval_request:${record.id}`),
        );
      }
      return { outcome: 'created', record };
    });
  }

  async findById(id: string): Promise<ApprovalRecord | null> {
    const row = await this.db
      .selectFrom('mcp_approvals')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toApprovalRecord(row) : null;
  }

  async findByTokenHash(
    tokenHash: string,
  ): Promise<{ readonly record: ApprovalRecord; readonly match: TokenMatch } | null> {
    const row = await this.db
      .selectFrom('mcp_approvals')
      .selectAll()
      .where((eb) =>
        eb.or([
          eb('link_token_hash', '=', tokenHash),
          eb('previous_token_hash', '=', tokenHash),
          sql<boolean>`${tokenHash} = any(prior_token_hashes)`,
        ]),
      )
      .executeTakeFirst();
    if (!row) return null;
    const record = toApprovalRecord(row);
    const match = matchToken(record, tokenHash);
    return match ? { record, match } : null;
  }

  async armLinkToken(
    id: string,
    subjectHash: string,
    tokenHash: string,
    now: Date,
  ): Promise<ApprovalRecord | null> {
    const row = await this.db
      .updateTable('mcp_approvals')
      .set({ link_token_hash: tokenHash, updated_at: now.toISOString() })
      .where('id', '=', id)
      .where('subject_hash', '=', subjectHash)
      .where('notify', '=', 'email')
      .where(openAt(now))
      .returningAll()
      .executeTakeFirst();
    return row ? toApprovalRecord(row) : null;
  }

  async markExpired(id: string, reason: string, now: Date): Promise<ApprovalRecord | null> {
    const at = now.toISOString();
    const row = await this.db
      .updateTable('mcp_approvals')
      .set({ expired_at: at, expired_reason: reason.slice(0, 64), updated_at: at })
      .where('id', '=', id)
      .where('approved_at', 'is', null)
      .where('denied_at', 'is', null)
      .where('failed_at', 'is', null)
      .where('expired_at', 'is', null)
      .returningAll()
      .executeTakeFirst();
    return row ? toApprovalRecord(row) : null;
  }

  async markFailedUndecided(
    id: string,
    slug: string,
    d: Parameters<ApprovalsRepository['markFailedUndecided']>[2],
  ): Promise<ApprovalRecord | null> {
    const at = d.now.toISOString();
    const row = await this.db
      .updateTable('mcp_approvals')
      .set({
        failed_at: at,
        result_slug: slug.slice(0, 64),
        decided_via: d.via,
        decided_ip: d.ip?.slice(0, 64) ?? null,
        decided_ua: d.userAgent?.slice(0, 512) ?? null,
        decided_signed_in: d.signedIn,
        updated_at: at,
      })
      .where('id', '=', id)
      .where(openAt(d.now))
      .returningAll()
      .executeTakeFirst();
    return row ? toApprovalRecord(row) : null;
  }

  async claimDecision(input: ClaimDecisionInput): Promise<ApprovalRecord | null> {
    const at = input.now.toISOString();
    let q = this.db
      .updateTable('mcp_approvals')
      .set({
        ...(input.decision === 'approve' ? { approved_at: at } : { denied_at: at }),
        decided_via: input.via,
        decided_ip: input.ip?.slice(0, 64) ?? null,
        decided_ua: input.userAgent?.slice(0, 512) ?? null,
        decided_signed_in: input.signedIn,
        updated_at: at,
      })
      .where('id', '=', input.id)
      .where('subject_hash', '=', input.subjectHash)
      .where(openAt(input.now));
    if (input.tokenHash !== null) {
      const hash = input.tokenHash;
      q = q.where((eb) =>
        eb.or([eb('link_token_hash', '=', hash), eb('previous_token_hash', '=', hash)]),
      );
    }
    if (input.ownerId !== null) q = q.where('owner_id', '=', input.ownerId);
    const row = await q.returningAll().executeTakeFirst();
    return row ? toApprovalRecord(row) : null;
  }

  async markCompleted(
    id: string,
    result: Readonly<Record<string, unknown>>,
    now: Date,
  ): Promise<ApprovalRecord | null> {
    const at = now.toISOString();
    const row = await this.db
      .updateTable('mcp_approvals')
      .set({ completed_at: at, result: JSON.stringify(result), updated_at: at })
      .where('id', '=', id)
      .where('approved_at', 'is not', null)
      .where('completed_at', 'is', null)
      .where('failed_at', 'is', null)
      .returningAll()
      .executeTakeFirst();
    return row ? toApprovalRecord(row) : null;
  }

  async markFailedAfterApprove(
    id: string,
    slug: string,
    now: Date,
  ): Promise<ApprovalRecord | null> {
    const at = now.toISOString();
    const row = await this.db
      .updateTable('mcp_approvals')
      .set({ failed_at: at, result_slug: slug.slice(0, 64), updated_at: at })
      .where('id', '=', id)
      .where('approved_at', 'is not', null)
      .where('completed_at', 'is', null)
      .where('failed_at', 'is', null)
      .returningAll()
      .executeTakeFirst();
    return row ? toApprovalRecord(row) : null;
  }

  async applyOwnerEdit(
    input: OwnerEditInput,
  ): Promise<
    | { readonly outcome: 'remint'; readonly record: ApprovalRecord; readonly mailed: boolean }
    | { readonly outcome: 'not_open' }
  > {
    return this.db.transaction().execute(async (trx) => {
      await lockOwner(trx, input.ownerId);
      const at = input.now.toISOString();
      const updated = await trx
        .updateTable('mcp_approvals')
        .set({
          subject_hash: input.subjectHash,
          summary: JSON.stringify(input.summary),
          approve_requires: input.approveRequires,
          previous_token_hash: input.previousTokenHash,
          link_token_hash: null,
          expires_at: input.expiresAt,
          owner_edited_at: at,
          updated_at: at,
        })
        .where('id', '=', input.id)
        .where('owner_id', '=', input.ownerId)
        .where('subject_hash', '=', input.expectSubjectHash)
        .where(openAt(input.now))
        .returningAll()
        .executeTakeFirst();
      if (!updated) return { outcome: 'not_open' as const };
      const record = toApprovalRecord(updated);
      let mailed = false;
      if (
        input.email &&
        (await requestMailsToday(trx, input.ownerId, input.now)) < input.maxMailsPerOwnerPerDay
      ) {
        await insertOutboundEmailIdempotent(
          new OutboundEmailsPgRepository(trx),
          input.email(record, `approval_request:${record.id}:${record.subjectHash}`),
        );
        mailed = true;
      }
      return { outcome: 'remint' as const, record, mailed };
    });
  }

  async list(
    ownerId: string,
    input: ListApprovalsInput,
  ): Promise<{ readonly items: readonly ApprovalRecord[]; readonly hasMore: boolean }> {
    let q = this.db.selectFrom('mcp_approvals').selectAll().where('owner_id', '=', ownerId);
    if (input.status) q = q.where(statusPredicate(input.status, input.now));
    if (input.cursor) {
      const c = input.cursor;
      q = q.where(sql<boolean>`(created_at, id) < (${c.createdAt}::timestamptz, ${c.id}::uuid)`);
    }
    const rows = await q
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(input.limit + 1)
      .execute();
    return {
      items: rows.slice(0, input.limit).map(toApprovalRecord),
      hasMore: rows.length > input.limit,
    };
  }

  async countPending(ownerId: string, now: Date): Promise<number> {
    const result = await sql<{ n: number }>`
      select count(*)::int as n from public.mcp_approvals
       where owner_id = ${ownerId}::uuid and ${statusPredicate('pending', now)}`.execute(this.db);
    return result.rows[0]?.n ?? 0;
  }

  async expireOpenForApiKey(apiKeyId: string, reason: string, now: Date): Promise<number> {
    const at = now.toISOString();
    const rows = await this.db
      .updateTable('mcp_approvals')
      .set({ expired_at: at, expired_reason: reason.slice(0, 64), updated_at: at })
      .where('api_key_id', '=', apiKeyId)
      .where('approved_at', 'is', null)
      .where('denied_at', 'is', null)
      .where('failed_at', 'is', null)
      .where('expired_at', 'is', null)
      .returning('id')
      .execute();
    return rows.length;
  }

  async expireOpenForOwner(ownerId: string, reason: string, now: Date): Promise<number> {
    const at = now.toISOString();
    const rows = await this.db
      .updateTable('mcp_approvals')
      .set({ expired_at: at, expired_reason: reason.slice(0, 64), updated_at: at })
      .where('owner_id', '=', ownerId)
      .where('approved_at', 'is', null)
      .where('denied_at', 'is', null)
      .where('failed_at', 'is', null)
      .where('expired_at', 'is', null)
      .returning('id')
      .execute();
    return rows.length;
  }

  async deleteAllForOwner(ownerId: string): Promise<number> {
    return this.db.transaction().execute(async (trx) => {
      await sql`
        delete from public.outbound_emails o
         using public.mcp_approvals a
         where a.owner_id = ${ownerId}::uuid
           and o.kind in ('approval_request', 'approval_denied')
           and o.payload->>'approval_id' = a.id::text`.execute(trx);
      await trx.deleteFrom('mcp_confirmations').where('owner_id', '=', ownerId).execute();
      const rows = await trx
        .deleteFrom('mcp_approvals')
        .where('owner_id', '=', ownerId)
        .returning('id')
        .execute();
      return rows.length;
    });
  }

  async countDenialsForKey(apiKeyId: string, since: Date): Promise<number> {
    const result = await sql<{ n: number }>`
      select count(*)::int as n from public.mcp_approvals
       where api_key_id = ${apiKeyId}::uuid
         and denied_at >= ${since.toISOString()}::timestamptz`.execute(this.db);
    return result.rows[0]?.n ?? 0;
  }

  async countOutboundSince(
    dayStart: Date,
    monthStart: Date,
  ): Promise<{ readonly day: number; readonly month: number }> {
    const result = await sql<{ day: number; month: number }>`
      select count(*) filter (where created_at >= ${dayStart.toISOString()}::timestamptz)::int as day,
             count(*)::int as month
        from public.outbound_emails
       where created_at >= ${monthStart.toISOString()}::timestamptz`.execute(this.db);
    return { day: result.rows[0]?.day ?? 0, month: result.rows[0]?.month ?? 0 };
  }

  async insertConfirmation(input: InsertConfirmationInput): Promise<void> {
    await this.db
      .insertInto('mcp_confirmations')
      .values({
        owner_id: input.ownerId,
        api_key_id: input.apiKeyId,
        oauth_grant_id: input.oauthGrantId,
        tool: 'envelopes_send',
        envelope_id: input.envelopeId,
        subject_hash: input.subjectHash,
        token_hash: input.tokenHash,
        expires_at: input.expiresAt,
      })
      .execute();
  }

  async consumeConfirmation(input: ConsumeConfirmationInput): Promise<boolean> {
    let q = this.db
      .updateTable('mcp_confirmations')
      .set({ consumed_at: input.now.toISOString() })
      .where('token_hash', '=', input.tokenHash)
      .where('envelope_id', '=', input.envelopeId)
      .where('subject_hash', '=', input.subjectHash)
      .where('consumed_at', 'is', null)
      .where('expires_at', '>', input.now);
    q =
      input.apiKeyId !== null
        ? q.where('api_key_id', '=', input.apiKeyId)
        : q.where('oauth_grant_id', '=', input.oauthGrantId);
    const row = await q.returning('id').executeTakeFirst();
    return row !== undefined;
  }
}

/** SQL for one derived status; mirrors `approvalStatus` in approval-state.ts. */
function statusPredicate(
  status: NonNullable<ListApprovalsInput['status']>,
  now: Date,
): RawBuilder<boolean> {
  const at = now.toISOString();
  const stale = new Date(now.getTime() - EXECUTION_STALE_MS).toISOString();
  switch (status) {
    case 'denied':
      return sql<boolean>`(denied_at is not null)`;
    case 'done':
      return sql<boolean>`(denied_at is null and failed_at is null and approved_at is not null and completed_at is not null)`;
    case 'failed':
      return sql<boolean>`(denied_at is null and (failed_at is not null
        or (approved_at is not null and completed_at is null and approved_at < ${stale}::timestamptz)))`;
    case 'expired':
      return sql<boolean>`(denied_at is null and failed_at is null and approved_at is null
        and (expired_at is not null or expires_at <= ${at}::timestamptz))`;
    case 'pending':
      return sql<boolean>`(denied_at is null and failed_at is null and (
        (approved_at is null and expired_at is null and expires_at > ${at}::timestamptz)
        or (approved_at is not null and completed_at is null and approved_at >= ${stale}::timestamptz)))`;
  }
}
