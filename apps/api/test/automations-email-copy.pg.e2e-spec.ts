import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { FeatureFlag } from 'shared';
import type { Database } from '../db/schema';
import { EmailCopyActionExecutor } from '../src/automations/actions/email/email-copy.executor';
import { EmailCopyPgRepository } from '../src/automations/actions/email/email-copy.repository.pg';
import {
  EMAIL_COPY_DAILY_CAP,
  hashStopToken,
} from '../src/automations/actions/email/email-copy.config';
import { EmailCopyLinkMinter } from '../src/automations/actions/email/email-copy-link-minter.service';
import { AutomationWorkerService } from '../src/automations/automation-worker.service';
import { AutomationsPgRepository } from '../src/automations/automations.repository.pg';
import { AutomationMatcherService } from '../src/automations/matcher';
import type { AppEnv } from '../src/config/env.schema';
import { EmailDispatcherService } from '../src/email/email-dispatcher.service';
import type { EmailMessage } from '../src/email/email-sender';
import { OutboundEmailsPgRepository } from '../src/email/outbound-emails.repository.pg';
import { TemplateService } from '../src/email/template.service';
import { EnvelopesPgRepository } from '../src/envelopes/envelopes.repository.pg';
import { SigningTokenService } from '../src/signing/signing-token.service';

/**
 * WP-33 (automations A7) against real Postgres, in a scratch database of
 * its own: migration 0034 up / down / up, the 50-a-day cap under real
 * concurrency, the sealed event -> matcher -> worker -> outbox -> dispatcher
 * path with a hash-only single-use stop link, and the over-cap deferral
 * that neither fails the run nor spends an attempt.
 */
const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;
const DB_NAME = `automations_email_copy_${randomBytes(4).toString('hex')}`;
const MIGRATIONS_DIR = resolve(__dirname, '../db/migrations');

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('SUBMIT_SIGNER_DATABASE_URL is required in CI for the email copy spec');
}

const describePg = databaseUrl ? describe : describe.skip;

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;

const ENV = {
  NODE_ENV: 'test',
  PORT: 3000,
  WORKER_ENABLED: false,
  AUTOMATIONS_DISABLED: false,
  APP_PUBLIC_URL: 'https://seald.nromomentum.com',
  SUPABASE_URL: 'https://abcdefgh.supabase.co',
  DATABASE_URL: 'postgres://u:p@db.abcdefgh.supabase.co:5432/postgres',
  CORS_ORIGIN: 'https://seald.nromomentum.com',
  AUTOMATION_SECRETS_KEY: '1e'.repeat(32),
  EMAIL_FROM_ADDRESS: 'no-reply@test.seald',
  EMAIL_FROM_NAME: 'Seald',
  EMAIL_LEGAL_ENTITY: 'Seald',
  EMAIL_LEGAL_POSTAL: 'Chlenov 24, Tel Aviv-Yafo 6604806, Israel',
  EMAIL_PRIVACY_URL: 'https://seald.nromomentum.com/legal/privacy',
  EMAIL_PREFERENCES_URL: 'mailto:privacy@seald.nromomentum.com',
} as AppEnv;

describePg('automation email copy (real Postgres)', () => {
  let admin: Pool | undefined;
  let pool: Pool | undefined;
  let dedicatedUrl = '';
  let db: Kysely<Database>;
  let repo: AutomationsPgRepository;
  let copyRepo: EmailCopyPgRepository;
  let envelopes: EnvelopesPgRepository;
  let worker: AutomationWorkerService;
  let dispatcher: EmailDispatcherService;
  let ownerId: string;
  let codeCounter = 0;
  const sent: EmailMessage[] = [];

  async function migrate(): Promise<void> {
    await execFileAsync('sh', [resolve(__dirname, '../scripts/migrate.sh')], {
      env: { ...process.env, DATABASE_URL: dedicatedUrl, MIGRATIONS_DIR },
    });
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('SUBMIT_SIGNER_DATABASE_URL missing');
    admin = new Pool({ connectionString: databaseUrl, max: 1 });
    admin.on('error', () => undefined);
    await admin.query(`drop database if exists ${DB_NAME} with (force)`);
    await admin.query(`create database ${DB_NAME}`);
    const dedicated = new URL(databaseUrl);
    dedicated.pathname = `/${DB_NAME}`;
    dedicatedUrl = dedicated.toString();
    pool = new Pool({ connectionString: dedicatedUrl, max: 25 });
    pool.on('error', () => undefined);
    await pool.query(`
      create schema if not exists auth;
      create table if not exists auth.users (id uuid primary key);
      create or replace function auth.uid() returns uuid
        language sql stable as $$ select null::uuid $$;
    `);
    await migrate();
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
    repo = new AutomationsPgRepository(db);
    copyRepo = new EmailCopyPgRepository(db);
    const matcher = new AutomationMatcherService(repo, ENV);
    envelopes = new EnvelopesPgRepository(db, matcher);
    const outbound = new OutboundEmailsPgRepository(db);
    const executor = new EmailCopyActionExecutor(copyRepo, outbound, ENV);
    worker = new AutomationWorkerService(repo, ENV, { email_copy: executor });
    const templates = new TemplateService();
    templates.onModuleInit();
    dispatcher = new EmailDispatcherService(
      outbound,
      {
        send: async (m: EmailMessage) => {
          sent.push(m);
          return { providerId: 'prv' };
        },
      },
      templates,
      envelopes,
      new SigningTokenService(),
      ENV,
      undefined,
      undefined,
      new EmailCopyLinkMinter(copyRepo, ENV),
    );
  }, 180_000);

  beforeEach(async () => {
    host.__SEALD_FEATURE_OVERRIDES__ = { workflowAutomations: true };
    ownerId = randomUUID();
    sent.length = 0;
    await pool!.query('insert into auth.users (id) values ($1)', [ownerId]);
  });

  afterEach(() => {
    delete host.__SEALD_FEATURE_OVERRIDES__;
  });

  afterAll(async () => {
    await db?.destroy();
    if (admin) {
      await admin.query(`drop database if exists ${DB_NAME} with (force)`);
      await admin.end();
    }
  });

  async function seedEnvelope(senderEmail: string | null = 'owner@example.com'): Promise<string> {
    codeCounter += 1;
    const e = await envelopes.createDraft({
      owner_id: ownerId,
      title: 'Lease',
      short_code: `EC${String(codeCounter).padStart(11, '0')}`,
      tc_version: 'tc',
      privacy_version: 'pp',
      expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    await pool!.query(
      'update public.envelopes set sender_email = $2, sender_name = $3 where id = $1',
      [e.id, senderEmail, 'Olive Owner'],
    );
    return e.id;
  }

  async function addRecipe(to: string[], trigger = 'envelope_sealed'): Promise<string> {
    const res = await pool!.query<{ id: string }>(
      `insert into public.automations (owner_id, recipe, name, enabled, trigger, action, config)
       values ($1, 'completed_email_copy', 'Copy', true, $2, 'email_copy', $3) returning id`,
      [ownerId, trigger, JSON.stringify({ to })],
    );
    return res.rows[0]!.id;
  }

  async function waitForJob(automationId: string): Promise<void> {
    for (let i = 0; i < 100; i += 1) {
      const r = await pool!.query('select 1 from automation_jobs where automation_id = $1', [
        automationId,
      ]);
      if (r.rowCount) return;
      await new Promise((ok) => setTimeout(ok, 20));
    }
    throw new Error('matcher did not enqueue a job');
  }

  async function seal(envelopeId: string): Promise<void> {
    await envelopes.appendEvent({
      envelope_id: envelopeId,
      actor_kind: 'system',
      event_type: 'sealed',
    });
  }

  it('migration 0034 applies, rolls back and applies again', async () => {
    const tables = async (): Promise<string[]> => {
      const r = await pool!.query<{ table_name: string }>(
        `select table_name from information_schema.tables
          where table_schema = 'public' and table_name like 'automation_copy_%' order by 1`,
      );
      return r.rows.map((x) => x.table_name);
    };
    const kinds = async (): Promise<string[]> => {
      const r = await pool!.query<{ e: string }>(
        `select enumlabel e from pg_enum where enumtypid = 'public.email_kind'::regtype`,
      );
      return r.rows.map((x) => x.e);
    };
    const expected = [
      'automation_copy_sends',
      'automation_copy_stop_tokens',
      'automation_copy_suppressions',
    ];
    expect(await tables()).toEqual(expected);
    expect(await kinds()).toContain('automation_copy');
    const rls = await pool!.query<{ relrowsecurity: boolean }>(
      `select relrowsecurity from pg_class where relname = any($1)`,
      [expected],
    );
    expect(rls.rows.every((r) => r.relrowsecurity)).toBe(true);

    // A queued automation_copy row has no pre-0034 equivalent: the rollback deletes it.
    await pool!.query(
      `insert into public.outbound_emails (kind, to_email, to_name, payload)
       values ('automation_copy', 'z@example.com', 'z', '{}')`,
    );

    const down = resolve(MIGRATIONS_DIR, 'down/0034_automation_email_copy_down.sql');
    const runDown = () =>
      execFileAsync('psql', [dedicatedUrl, '-v', 'ON_ERROR_STOP=1', '-q', '-f', down]);
    await runDown();
    expect(await tables()).toEqual([]);
    expect(
      (await pool!.query(`select 1 from outbound_emails where kind::text = 'automation_copy'`))
        .rowCount,
    ).toBe(0);
    // Idempotent, and the enum label stays (documented in the down script).
    await runDown();
    expect(await kinds()).toContain('automation_copy');

    await pool!.query(`delete from public.schema_migrations where filename = $1`, [
      '0034_automation_email_copy.sql',
    ]);
    await migrate();
    expect(await tables()).toEqual(expected);
    // Re-running the up file by hand is a no-op.
    await execFileAsync('psql', [
      dedicatedUrl,
      '-v',
      'ON_ERROR_STOP=1',
      '-q',
      '-f',
      resolve(MIGRATIONS_DIR, '0034_automation_email_copy.sql'),
    ]);
    expect(await tables()).toEqual(expected);
  }, 120_000);

  it('caps an owner at 50 recipient-messages a UTC day under concurrent reservations', async () => {
    // 20 concurrent runs x 5 addresses = 100 asked, 50 allowed: exactly 10 win.
    const runs: string[] = [];
    const automationId = await addRecipe(['a@example.com']);
    const envelopeId = await seedEnvelope();
    for (let i = 0; i < 20; i += 1) {
      const r = await pool!.query<{ id: string }>(
        `insert into public.automation_runs (automation_id, owner_id, envelope_id, signer_id, trigger, action)
         values ($1, $2, $3, $4, 'signer_signed', 'email_copy') returning id`,
        [automationId, ownerId, envelopeId, randomUUID()],
      );
      runs.push(r.rows[0]!.id);
    }
    const results = await Promise.all(
      runs.map((runId, i) =>
        copyRepo.reserveSends({
          ownerId,
          runId,
          emails: Array.from({ length: 5 }, (_, k) => `u${i}-${k}@example.com`),
          day: '2026-10-22',
          cap: EMAIL_COPY_DAILY_CAP,
        }),
      ),
    );
    expect(results.filter((r) => r === 'reserved')).toHaveLength(10);
    expect(results.filter((r) => r === 'capped')).toHaveLength(10);
    const total = await pool!.query<{ n: string }>(
      `select count(*) n from automation_copy_sends where owner_id = $1 and day = '2026-10-22'`,
      [ownerId],
    );
    expect(Number(total.rows[0]!.n)).toBe(50);

    // A retry of a run that already won spends nothing and is still 'reserved'.
    const winner = runs[results.indexOf('reserved')]!;
    expect(
      await copyRepo.reserveSends({
        ownerId,
        runId: winner,
        emails: Array.from(
          { length: 5 },
          (_, k) => `u${results.indexOf('reserved')}-${k}@example.com`,
        ),
        day: '2026-10-22',
        cap: EMAIL_COPY_DAILY_CAP,
      }),
    ).toBe('reserved');
    // The next UTC day is a fresh bucket.
    expect(
      await copyRepo.reserveSends({
        ownerId,
        runId: runs[results.indexOf('capped')]!,
        emails: ['n@example.com'],
        day: '2026-10-23',
        cap: EMAIL_COPY_DAILY_CAP,
      }),
    ).toBe('reserved');
  });

  it('sealed event -> run -> outbox -> mail with a hash-only single-use stop link', async () => {
    const automationId = await addRecipe(['ada@example.com', 'bob@example.com']);
    const envelopeId = await seedEnvelope();
    await seal(envelopeId);
    await waitForJob(automationId);

    expect(await worker.flushOnce(10)).toEqual({ claimed: 1, done: 1, retrying: 0, failed: 0 });
    const queued = await pool!.query<{ to_email: string; kind: string; dedupe_key: string }>(
      `select to_email, kind::text, dedupe_key from outbound_emails
        where envelope_id = $1 and kind::text = 'automation_copy' order by to_email`,
      [envelopeId],
    );
    expect(queued.rows.map((r) => r.to_email)).toEqual(['ada@example.com', 'bob@example.com']);
    expect(queued.rows[0]!.dedupe_key).toMatch(/^automation_copy:[0-9a-f-]{36}:ada@example\.com$/);

    await dispatcher.flushOnce(10, { envelopeIds: [envelopeId] });
    expect(sent).toHaveLength(2);
    const ada = sent.find((m) => m.to.email === 'ada@example.com')!;
    expect(ada.subject).toBe('Seald notice for Olive Owner: "Lease" was sealed');
    expect(ada.text).toContain('Seald · Chlenov 24, Tel Aviv-Yafo 6604806, Israel');
    expect(ada.html + ada.text).not.toMatch(/\/sign\/|download/i);
    const token = /automations\/stop\?t=([A-Za-z0-9_-]{43})/.exec(ada.text)![1]!;

    // Only the hash is in the database, anywhere.
    const leak = await pool!.query<{ n: string }>(
      `select count(*) n from (
         select payload::text t from outbound_emails where envelope_id = $1
         union all select token_hash from automation_copy_stop_tokens
       ) x where t like '%' || $2 || '%'`,
      [envelopeId, token],
    );
    expect(Number(leak.rows[0]!.n)).toBe(0);
    expect(await copyRepo.peekStopToken(hashStopToken(token))).toEqual({
      email: 'ada@example.com',
    });

    // Concurrent clicks: exactly one spends the token.
    const clicks = await Promise.all(
      Array.from({ length: 5 }, () => copyRepo.consumeStopToken(hashStopToken(token))),
    );
    expect(clicks.filter((c) => c.kind === 'stopped')).toHaveLength(1);
    expect(await copyRepo.peekStopToken(hashStopToken(token))).toBeNull();

    // Only ada was removed from the owner's recipe; the recipe stays on.
    const recipe = await pool!.query<{ config: { to: string[] }; enabled: boolean }>(
      'select config, enabled from automations where id = $1',
      [automationId],
    );
    expect(recipe.rows[0]).toMatchObject({ config: { to: ['bob@example.com'] }, enabled: true });
    expect(await copyRepo.isSuppressed(ownerId, 'ada@example.com')).toBe(true);
    expect(await copyRepo.isSuppressed(ownerId, 'bob@example.com')).toBe(false);

    // Another owner's address is untouched, and a later run skips ada.
    const env2 = await seedEnvelope();
    await seal(env2);
    await waitForJob(automationId);
    await worker.flushOnce(10);
    const later = await pool!.query<{ to_email: string }>(
      `select to_email from outbound_emails where envelope_id = $1 and kind::text = 'automation_copy'`,
      [env2],
    );
    expect(later.rows.map((r) => r.to_email)).toEqual(['bob@example.com']);

    // The last address stopping turns the recipe off.
    sent.length = 0;
    await dispatcher.flushOnce(10, { envelopeIds: [env2] });
    const bobToken = /automations\/stop\?t=([A-Za-z0-9_-]{43})/.exec(sent[0]!.text)![1]!;
    await copyRepo.consumeStopToken(hashStopToken(bobToken));
    const off = await pool!.query<{ enabled: boolean; config: { to: string[] } }>(
      'select enabled, config from automations where id = $1',
      [automationId],
    );
    expect(off.rows[0]).toMatchObject({ enabled: false, config: { to: [] } });
  }, 60_000);

  it('a row queued before the address stopped is skipped at send time', async () => {
    const automationId = await addRecipe(['late@example.com']);
    const envelopeId = await seedEnvelope();
    await seal(envelopeId);
    await waitForJob(automationId);
    await worker.flushOnce(10);
    await pool!.query(
      `insert into automation_copy_suppressions (owner_id, email) values ($1, 'late@example.com')`,
      [ownerId],
    );
    const out = await dispatcher.flushOnce(10, { envelopeIds: [envelopeId] });
    expect(out.skipped).toBe(1);
    expect(sent).toHaveLength(0);
  });

  it('over the cap the run waits for the next UTC day: queued, not failed, no attempt spent', async () => {
    const automationId = await addRecipe(['cap@example.com']);
    const envelopeId = await seedEnvelope();
    // Fill today's quota with another run's ledger rows.
    const filler = await pool!.query<{ id: string }>(
      `insert into public.automation_runs (automation_id, owner_id, envelope_id, signer_id, trigger, action)
       values ($1, $2, $3, $4, 'signer_signed', 'email_copy') returning id`,
      [automationId, ownerId, envelopeId, randomUUID()],
    );
    const today = new Date().toISOString().slice(0, 10);
    await pool!.query(
      `insert into automation_copy_sends (run_id, email, owner_id, day)
       select $1, 'f' || g || '@example.com', $2, $3::date from generate_series(1, 50) g`,
      [filler.rows[0]!.id, ownerId, today],
    );
    await seal(envelopeId);
    await waitForJob(automationId);
    const result = await worker.flushOnce(10);
    expect(result).toEqual({ claimed: 1, done: 0, retrying: 1, failed: 0 });
    const run = await pool!.query<{ status: string; last_error: string; attempts: number }>(
      `select status::text, last_error, attempts from automation_runs
        where automation_id = $1 and signer_id is null`,
      [automationId],
    );
    expect(run.rows[0]).toEqual({
      status: 'queued',
      last_error: 'email_copy_daily_cap',
      attempts: 0,
    });
    const job = await pool!.query<{ attempts: number; scheduled_for: Date; status: string }>(
      `select j.attempts, j.scheduled_for, j.status from automation_jobs j
         join automation_runs r on r.id = j.run_id
        where r.automation_id = $1 and r.signer_id is null`,
      [automationId],
    );
    expect(job.rows[0]!.attempts).toBe(0);
    expect(job.rows[0]!.status).toBe('pending');
    const midnight = new Date();
    midnight.setUTCHours(24, 0, 0, 0);
    expect(job.rows[0]!.scheduled_for.getTime()).toBe(midnight.getTime());
    expect(
      (await pool!.query(`select 1 from outbound_emails where envelope_id = $1`, [envelopeId]))
        .rowCount,
    ).toBe(0);
  });

  it('a sender without a mailbox fails permanently with sender_email_missing', async () => {
    const automationId = await addRecipe([]);
    const envelopeId = await seedEnvelope(null);
    await seal(envelopeId);
    await waitForJob(automationId);
    expect(await worker.flushOnce(10)).toMatchObject({ failed: 1 });
    const run = await pool!.query<{ status: string; retryable: boolean; last_error: string }>(
      'select status::text, retryable, last_error from automation_runs where automation_id = $1',
      [automationId],
    );
    expect(run.rows[0]).toEqual({
      status: 'failed',
      retryable: false,
      last_error: 'sender_email_missing',
    });
  });
});
