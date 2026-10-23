import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool, type QueryResult } from 'pg';
import type { Database } from '../db/schema';
import type { AppEnv } from '../src/config/env.schema';
import { OutboundEmailsPgRepository } from '../src/email/outbound-emails.repository.pg';
import { EnvelopesPgRepository } from '../src/envelopes/envelopes.repository.pg';
import { SigningOrderService } from '../src/signing/signing-order.service';
import { StepSweepPgRepository } from '../src/signing/step-sweep.repository.pg';
import { StepSweepService } from '../src/signing/step-sweep.service';

/**
 * WP-05 signing order against real Postgres:
 *
 *   1. Concurrency: the last two signatures of a sequential step land at
 *      the same moment (both submits queued on the envelope row lock).
 *      Exactly one of them starts the next step; `invited_at` is stamped
 *      once. Without the FOR UPDATE both could see the step incomplete,
 *      or both could report the next step.
 *   2. send stamps `invited_at` on step 1 only; setSigningOrder is
 *      draft-only.
 *   3. Step sweep backstop: a step whose after-commit half was lost
 *      (no invite, maybe no step_started) is resumed once, even by two
 *      overlapping sweeps; an existing step_started is reused; later
 *      passes do nothing.
 *   4. Migration 0023: backfill of `invited_at` for envelopes already
 *      sent, idempotent re-run, and up → down → up.
 *
 * Creates its own scratch database on the server SUBMIT_SIGNER_DATABASE_URL
 * names and migrates it with the real runner, then drops it. Every row it
 * writes belongs to a fresh owner, and the down/up test ends with 0023 applied.
 * Skips without the URL; in CI a missing URL fails the file.
 */
const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;
const DB_NAME = `signing_order_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
const MIGRATIONS_DIR = resolve(__dirname, '../db/migrations');
const UP = join(MIGRATIONS_DIR, '0023_signing_order.sql');
const DOWN = join(MIGRATIONS_DIR, 'down', '0023_signing_order_down.sql');
const APP_NAME = 'signing-order-pg';

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('SUBMIT_SIGNER_DATABASE_URL is required in CI for the signing-order pg spec');
}

const describePg = databaseUrl ? describe : describe.skip;

describePg('signing order (real Postgres)', () => {
  let pool: Pool;
  let db: Kysely<Database>;
  let repo: EnvelopesPgRepository;
  let dedicatedUrl: string;
  let admin: Pool | undefined;
  let ownerId: string;

  async function psqlFile(file: string): Promise<void> {
    await execFileAsync('psql', [dedicatedUrl, '-v', 'ON_ERROR_STOP=1', '-1', '-q', '-f', file]);
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('SUBMIT_SIGNER_DATABASE_URL missing');
    // Own scratch database: the URL database is shared with
    // submit-signer.concurrency, and two migrate.sh runs on one database
    // race on schema_migrations when jest runs the suites in parallel.
    admin = new Pool({ connectionString: databaseUrl, max: 1 });
    admin.on('error', () => undefined);
    await admin.query(`drop database if exists ${DB_NAME} with (force)`);
    await admin.query(`create database ${DB_NAME}`);
    const dedicated = new URL(databaseUrl);
    dedicated.pathname = `/${DB_NAME}`;
    dedicatedUrl = dedicated.toString();
    pool = new Pool({ connectionString: dedicatedUrl, max: 12, application_name: APP_NAME });
    pool.on('error', () => undefined);
    await pool.query(`
      create schema if not exists auth;
      create table if not exists auth.users (id uuid primary key);
      create or replace function auth.uid() returns uuid
        language sql stable as $$ select null::uuid $$;
    `);
    await execFileAsync('sh', [resolve(__dirname, '../scripts/migrate.sh')], {
      env: { ...process.env, DATABASE_URL: dedicatedUrl, MIGRATIONS_DIR },
    });
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
    repo = new EnvelopesPgRepository(db);
    ownerId = randomUUID();
    await pool.query('insert into auth.users (id) values ($1)', [ownerId]);
  }, 180_000);

  afterAll(async () => {
    await db?.destroy();
    if (admin) {
      await admin.query(`drop database if exists ${DB_NAME} with (force)`);
      await admin.end();
    }
  });

  async function draftWith(
    orders: Readonly<Record<string, number>>,
  ): Promise<{ envelopeId: string; ids: Record<string, string> }> {
    const envelope = await repo.createDraft({
      owner_id: ownerId,
      title: 'Ordered',
      short_code: randomBytes(8).toString('hex').slice(0, 13),
      tc_version: 'tc-v1',
      privacy_version: 'pp-v1',
      expires_at: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
    });
    const ids: Record<string, string> = {};
    for (const name of Object.keys(orders)) {
      const signer = await repo.addSigner(envelope.id, {
        email: `${name}-${envelope.id.slice(0, 8)}@example.com`,
        name,
        color: '#112233',
      });
      ids[name] = signer.id;
    }
    const set = await repo.setSigningOrder(envelope.id, {
      delivery_mode: 'sequential',
      orders: Object.entries(orders).map(([name, signing_order]) => ({
        signer_id: ids[name]!,
        signing_order,
      })),
    });
    if (!set) throw new Error('setSigningOrder failed');
    return { envelopeId: envelope.id, ids };
  }

  async function ready(signerId: string): Promise<void> {
    await repo.acceptTerms(signerId);
    await repo.setSignerSignature(signerId, {
      signature_format: 'typed',
      signature_image_path: `sigs/${signerId}.png`,
    });
  }

  async function invitedAt(envelopeId: string): Promise<Record<string, string | null>> {
    const res = await pool.query<{ name: string; invited_at: Date | null }>(
      'select name, invited_at from public.envelope_signers where envelope_id = $1',
      [envelopeId],
    );
    return Object.fromEntries(
      res.rows.map((r) => [r.name, r.invited_at ? r.invited_at.toISOString() : null]),
    );
  }

  it('send stamps step 1 only; the order is draft-only', async () => {
    const { envelopeId, ids } = await draftWith({ ada: 1, bea: 1, cy: 2 });
    const sent = await repo.sendDraft({
      envelope_id: envelopeId,
      sender_email: 'sender@example.com',
      sender_name: 'Sender',
      delivery_mode: 'sequential',
    });
    expect(sent?.delivery_mode).toBe('sequential');
    const stamps = await invitedAt(envelopeId);
    expect(stamps['ada']).not.toBeNull();
    expect(stamps['bea']).not.toBeNull();
    expect(stamps['cy']).toBeNull();

    const late = await repo.setSigningOrder(envelopeId, {
      delivery_mode: 'parallel',
      orders: [{ signer_id: ids['cy']!, signing_order: 1 }],
    });
    expect(late).toBeNull();
    const row = await pool.query<{ delivery_mode: string }>(
      'select delivery_mode from public.envelopes where id = $1',
      [envelopeId],
    );
    expect(row.rows[0]?.delivery_mode).toBe('sequential');
  });

  it('starts the next step exactly once when the last two step signatures land together', async () => {
    const { envelopeId, ids } = await draftWith({ ada: 1, bea: 1, cy: 2 });
    await repo.sendDraft({
      envelope_id: envelopeId,
      sender_email: 'sender@example.com',
      sender_name: 'Sender',
      delivery_mode: 'sequential',
    });
    await ready(ids['ada']!);
    await ready(ids['bea']!);

    const holder = await pool.connect();
    let committed = false;
    try {
      await holder.query('begin');
      await holder.query('select id from envelopes where id = $1 for update', [envelopeId]);

      const pending = Promise.all([
        repo.submitSigner(ids['ada']!, null, null),
        repo.submitSigner(ids['bea']!, null, null),
      ]);
      let waitError: Error | undefined;
      try {
        await waitForEnvelopeLockWaiters(pool, 2);
      } catch (err) {
        waitError = err instanceof Error ? err : new Error(String(err));
      }
      await holder.query('commit');
      committed = true;
      const results = await pending;
      if (waitError) throw waitError;

      expect(results.every((r) => r !== null)).toBe(true);
      expect(results.every((r) => r?.all_signed === false)).toBe(true);
      const starters = results.filter((r) => r?.next_step);
      expect(starters).toHaveLength(1);
      expect(starters[0]?.next_step).toEqual({
        step: 2,
        signing_order: 2,
        signer_ids: [ids['cy']],
      });
      expect(results.filter((r) => !r?.next_step)).toHaveLength(1);
    } finally {
      if (!committed) await holder.query('rollback');
      holder.release();
    }

    const stamps = await invitedAt(envelopeId);
    expect(stamps['cy']).not.toBeNull();
    // A re-run of the rule (e.g. a retried submit) finds nothing new.
    await ready(ids['cy']!);
    const last = await repo.submitSigner(ids['cy']!, null, null);
    expect(last?.all_signed).toBe(true);
    expect(last?.next_step ?? null).toBeNull();
    expect(last?.envelope_status).toBe('sealing');
  }, 30_000);

  describe('step sweep', () => {
    const ENV = { APP_PUBLIC_URL: 'https://seald.example', WORKER_ENABLED: false } as AppEnv;
    let outbound: OutboundEmailsPgRepository;
    let order: SigningOrderService;
    let sweeper: StepSweepService;

    beforeAll(() => {
      outbound = new OutboundEmailsPgRepository(db);
      order = new SigningOrderService(repo, outbound, ENV);
      sweeper = new StepSweepService(new StepSweepPgRepository(db), repo, order, ENV);
    });

    async function sendSequential(envelopeId: string): Promise<void> {
      const sent = await repo.sendDraft({
        envelope_id: envelopeId,
        sender_email: 'sender@example.com',
        sender_name: 'Sender',
        delivery_mode: 'sequential',
      });
      if (!sent) throw new Error('sendDraft failed');
    }

    async function inviteRows(envelopeId: string) {
      return (
        await pool.query<{ signer_id: string; source_event_id: string; dedupe_key: string }>(
          `select signer_id, source_event_id, dedupe_key from public.outbound_emails
            where envelope_id = $1 and kind = 'invite' order by created_at`,
          [envelopeId],
        )
      ).rows;
    }

    async function stepEvents(envelopeId: string) {
      return (
        await pool.query<{ id: string; metadata: Record<string, unknown> }>(
          `select id, metadata from public.envelope_events
            where envelope_id = $1 and event_type = 'step_started' order by created_at`,
          [envelopeId],
        )
      ).rows;
    }

    async function age(envelopeId: string, minutes: number): Promise<void> {
      await pool.query(
        `update public.envelope_signers
            set invited_at = invited_at - make_interval(mins => $2)
          where envelope_id = $1 and invited_at is not null`,
        [envelopeId, minutes],
      );
    }

    async function inviteFor(envelopeId: string, signerId: string): Promise<void> {
      await outbound.insert({
        envelope_id: envelopeId,
        signer_id: signerId,
        kind: 'invite',
        to_email: `${signerId}@example.com`,
        to_name: 'S',
        payload: { envelope_title: 'Ordered' },
      });
    }

    it('resumes a step whose invites were lost exactly once under overlapping sweeps', async () => {
      const { envelopeId, ids } = await draftWith({ ada: 1, bea: 2 });
      await sendSequential(envelopeId);
      await inviteFor(envelopeId, ids['ada']!);
      await ready(ids['ada']!);
      const submitted = await repo.submitSigner(ids['ada']!, null, null);
      expect(submitted?.next_step?.signer_ids).toEqual([ids['bea']]);
      // The after-commit startStep "failed": no event, no invite for Bea.

      // Too fresh: the sweep leaves a just-started step alone.
      const fresh = await sweeper.sweep(new Date());
      expect(fresh.resumed_envelope_ids).not.toContain(envelopeId);

      await age(envelopeId, 10);
      const [one, two] = await Promise.all([sweeper.sweep(new Date()), sweeper.sweep(new Date())]);
      const hits = [...one.resumed_envelope_ids, ...two.resumed_envelope_ids].filter(
        (id) => id === envelopeId,
      );
      expect(hits).toHaveLength(1);

      const events = await stepEvents(envelopeId);
      expect(events).toHaveLength(1);
      expect(events[0]?.metadata).toMatchObject({ step: 2, signing_order: 2 });
      const invites = await inviteRows(envelopeId);
      expect(invites.filter((r) => r.signer_id === ids['bea'])).toEqual([
        {
          signer_id: ids['bea'],
          source_event_id: events[0]?.id,
          dedupe_key: `invite_step:${envelopeId}:${ids['bea']}`,
        },
      ]);

      // A later pass, even with the stamp aged again, finds Bea invited.
      await age(envelopeId, 30);
      const later = await sweeper.sweep(new Date());
      expect(later.resumed_envelope_ids).not.toContain(envelopeId);
      expect(await stepEvents(envelopeId)).toHaveLength(1);
      expect((await inviteRows(envelopeId)).filter((r) => r.signer_id === ids['bea'])).toHaveLength(
        1,
      );
    }, 30_000);

    it('reuses a step_started that was appended before the failure', async () => {
      const { envelopeId, ids } = await draftWith({ cy: 1, dan: 2 });
      await sendSequential(envelopeId);
      await inviteFor(envelopeId, ids['cy']!);
      await ready(ids['cy']!);
      await repo.submitSigner(ids['cy']!, null, null);
      const appended = await repo.appendEvent({
        envelope_id: envelopeId,
        actor_kind: 'system',
        event_type: 'step_started',
        metadata: { step: 2, signing_order: 2, signer_ids: [ids['dan']] },
      });
      await age(envelopeId, 10);

      const result = await sweeper.sweep(new Date());
      expect(result.resumed_envelope_ids).toContain(envelopeId);
      const events = await stepEvents(envelopeId);
      expect(events.map((e) => e.id)).toEqual([appended.id]);
      const dan = (await inviteRows(envelopeId)).filter((r) => r.signer_id === ids['dan']);
      expect(dan.map((r) => r.source_event_id)).toEqual([appended.id]);
      expect((await repo.verifyEventChain(envelopeId)).chain_intact).toBe(true);
    }, 30_000);

    it('resumes step 1 when send died before its invites, and skips parallel envelopes', async () => {
      const lost = await draftWith({ eve: 1, fay: 2 });
      await sendSequential(lost.envelopeId);
      await age(lost.envelopeId, 10);

      const parallel = await draftWith({ gus: 1 });
      await repo.sendDraft({
        envelope_id: parallel.envelopeId,
        sender_email: 'sender@example.com',
        sender_name: 'Sender',
        delivery_mode: 'parallel',
      });
      await age(parallel.envelopeId, 10);

      const result = await sweeper.sweep(new Date());
      expect(result.resumed_envelope_ids).toContain(lost.envelopeId);
      expect(result.resumed_envelope_ids).not.toContain(parallel.envelopeId);
      const invites = await inviteRows(lost.envelopeId);
      expect(invites.map((r) => r.signer_id)).toEqual([lost.ids['eve']]);
      const events = await stepEvents(lost.envelopeId);
      expect(events).toHaveLength(1);
      expect(events[0]?.metadata).toMatchObject({ step: 1, signing_order: 1 });
      expect(await inviteRows(parallel.envelopeId)).toEqual([]);
    }, 30_000);
  });

  it('0023: backfills sent envelopes, re-runs idempotently, and survives up → down → up', async () => {
    // An envelope sent before 0023: invited_at null, one `sent` event per
    // signer (Ada's backdated), and a draft that must stay untouched.
    const sentAt = new Date(Date.now() - 3 * 24 * 3600 * 1000);
    const adaSent = new Date(sentAt.getTime() + 60_000);
    const legacy = await draftWith({ ada: 1, bea: 1 });
    await pool.query(
      `update public.envelopes
          set status = 'awaiting_others', sent_at = $2, delivery_mode = 'parallel'
        where id = $1`,
      [legacy.envelopeId, sentAt],
    );
    await pool.query(
      `insert into public.envelope_events (envelope_id, signer_id, actor_kind, event_type, created_at)
       values ($1, $2, 'system', 'sent', $3)`,
      [legacy.envelopeId, legacy.ids['ada'], adaSent],
    );
    const draft = await draftWith({ dee: 1 });
    await pool.query(
      'update public.envelope_signers set invited_at = null where envelope_id = any($1::uuid[])',
      [[legacy.envelopeId, draft.envelopeId]],
    );

    await psqlFile(UP);
    const stamps = await invitedAt(legacy.envelopeId);
    expect(stamps['ada']).toBe(adaSent.toISOString());
    expect(stamps['bea']).toBe(sentAt.toISOString());
    expect((await invitedAt(draft.envelopeId))['dee']).toBeNull();
    // Re-running changes nothing.
    await psqlFile(UP);
    expect(await invitedAt(legacy.envelopeId)).toEqual(stamps);

    await pool.query(
      `insert into public.envelope_events (envelope_id, actor_kind, event_type, metadata)
       values ($1, 'system', 'step_started', '{"step":1}')`,
      [legacy.envelopeId],
    );
    await psqlFile(DOWN);
    const col = await pool.query(
      `select 1 from information_schema.columns
        where table_name = 'envelope_signers' and column_name = 'invited_at'`,
    );
    expect(col.rowCount).toBe(0);
    const label = await pool.query(
      `select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
        where t.typname = 'event_type' and e.enumlabel = 'step_started'`,
    );
    expect(label.rowCount).toBe(0);
    // Every other label survives, including ones added after 0023.
    const labels = await pool.query<{ enumlabel: string }>(
      `select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
        where t.typname = 'event_type'`,
    );
    expect(labels.rows.map((r) => r.enumlabel)).toEqual(
      expect.arrayContaining(['document_added', 'pdf_uploaded', 'sent']),
    );
    const rewritten = await pool.query<{ event_type: string }>(
      `select event_type from public.envelope_events
        where envelope_id = $1 order by created_at`,
      [legacy.envelopeId],
    );
    expect(rewritten.rows.map((r) => r.event_type)).toEqual(['sent', 'sent']);
    await psqlFile(DOWN);

    await psqlFile(UP);
    const again = await invitedAt(legacy.envelopeId);
    expect(again['ada']).toBe(adaSent.toISOString());
    await pool.query(
      `insert into public.envelope_events (envelope_id, actor_kind, event_type)
       values ($1, 'system', 'step_started')`,
      [legacy.envelopeId],
    );
  }, 60_000);
});

async function waitForEnvelopeLockWaiters(pool: Pool, expected: number): Promise<void> {
  const deadline = Date.now() + 8_000;
  let last = '[]';
  while (Date.now() < deadline) {
    const res: QueryResult<{ query: string | null }> = await pool.query(
      `select left(query, 240) as query
         from pg_stat_activity
        where application_name = $1
          and pid <> pg_backend_pid()
          and state = 'active'
          and wait_event_type = 'Lock'
          and query ilike '%for update%'`,
      [APP_NAME],
    );
    last = JSON.stringify(res.rows);
    if ((res.rowCount ?? 0) >= expected) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
  throw new Error(
    `expected ${expected} sessions waiting on the envelope FOR UPDATE; saw ${last}. ` +
      'submitSigner must lock the envelope row so only one submit starts the next step.',
  );
}
