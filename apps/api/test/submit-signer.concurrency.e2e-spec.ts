import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool, type QueryResult } from 'pg';
import type { Database } from '../db/schema';
import type { AppEnv } from '../src/config/env.schema';
import { EmailDispatcherService } from '../src/email/email-dispatcher.service';
import { EmailSender, type EmailSendResult } from '../src/email/email-sender';
import { OutboundEmailsPgRepository } from '../src/email/outbound-emails.repository.pg';
import { TemplateService } from '../src/email/template.service';
import { EnvelopesPgRepository } from '../src/envelopes/envelopes.repository.pg';
import { ReminderSchedulerService } from '../src/reminders/reminder-scheduler.service';

/**
 * Two final submitSigner calls, overlapping, against real Postgres.
 *
 * pg-mem parses FOR UPDATE and does not lock, so this file is excluded
 * from the unit runner. CI provides Postgres and psql. Without
 * SUBMIT_SIGNER_DATABASE_URL the suite skips, except in CI where a
 * missing URL is a failure.
 *
 * A third session holds the envelope row until both submissions are
 * blocked on it. That is the "same moment": both transactions are
 * inside submitSigner together. The row lock then lets one count 1/2
 * and the other, after it commits, count 2/2 and flip to sealing.
 * If the FOR UPDATE is removed, nobody waits, and this fails.
 */
const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error(
    'SUBMIT_SIGNER_DATABASE_URL is required in CI so submitSigner is tested against real Postgres locks',
  );
}

const describePg = databaseUrl ? describe : describe.skip;

describePg('submitSigner concurrency (real Postgres)', () => {
  let pool: Pool | undefined;
  let db: Kysely<Database> | undefined;
  let repo: EnvelopesPgRepository | undefined;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('SUBMIT_SIGNER_DATABASE_URL missing');
    pool = new Pool({
      connectionString: databaseUrl,
      max: 12,
      application_name: 'submit-signer-concurrency',
    });
    await pool.query(`
      create schema if not exists auth;
      create table if not exists auth.users (id uuid primary key);
      create or replace function auth.uid() returns uuid
        language sql stable as $$ select null::uuid $$;
    `);
    const migrationsDir = resolve(__dirname, '../db/migrations');
    const script = resolve(__dirname, '../scripts/migrate.sh');
    await execFileAsync('sh', [script], {
      env: { ...process.env, DATABASE_URL: databaseUrl, MIGRATIONS_DIR: migrationsDir },
    });
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
    repo = new EnvelopesPgRepository(db);
  }, 180_000);

  afterAll(async () => {
    await db?.destroy();
  });

  it('seals exactly once when the last two signatures land together', async () => {
    if (!pool || !db || !repo) throw new Error('postgres harness did not start');
    const pg = pool;
    const database = db;
    const envelopes = repo;
    const ownerId = randomUUID();
    await pg.query('insert into auth.users (id) values ($1)', [ownerId]);
    const envelope = await envelopes.createDraft({
      owner_id: ownerId,
      title: 'Concurrent close',
      short_code: randomBytes(8).toString('hex').slice(0, 13),
      tc_version: 'tc-v1',
      privacy_version: 'pp-v1',
      expires_at: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
    });
    const ada = await readySigner(envelopes, envelope.id, 'ada@example.com');
    const bea = await readySigner(envelopes, envelope.id, 'bea@example.com');
    await database
      .updateTable('envelopes')
      .set({ status: 'awaiting_others' })
      .where('id', '=', envelope.id)
      .execute();

    const holder = await pg.connect();
    let committed = false;
    try {
      await holder.query('begin');
      await holder.query('select id from envelopes where id = $1 for update', [envelope.id]);

      const pending = Promise.all([
        envelopes.submitSigner(ada.id, null, null),
        envelopes.submitSigner(bea.id, null, null),
      ]);
      let waitError: Error | undefined;
      try {
        await waitForEnvelopeLockWaiters(pg, 2);
      } catch (err) {
        waitError = err instanceof Error ? err : new Error(String(err));
      }
      await holder.query('commit');
      committed = true;

      const [first, second] = await pending;
      if (waitError) throw waitError;

      const results = [first, second];
      expect(results.every((result) => result !== null)).toBe(true);
      const sealed = results.filter((result) => result?.all_signed === true);
      const waiting = results.filter((result) => result?.all_signed === false);
      expect(sealed).toHaveLength(1);
      expect(waiting).toHaveLength(1);
      expect(sealed[0]?.envelope_status).toBe('sealing');
      expect(sealed[0]?.done).toBe(2);
      expect(sealed[0]?.total).toBe(2);
      expect(waiting[0]?.done).toBe(1);
      expect(waiting[0]?.envelope_status).toBe('awaiting_others');

      const stored = await envelopes.findByIdWithAll(envelope.id);
      expect(stored?.status).toBe('sealing');
      expect(stored?.signers.filter((signer) => signer.signed_at !== null)).toHaveLength(2);
    } finally {
      if (!committed) await holder.query('rollback');
      holder.release();
    }
  }, 30_000);

  it('still finds a sign link after more than 20 reminder rows without one', async () => {
    if (!pool || !db) throw new Error('postgres harness did not start');
    const pg = pool;
    const envelopes = new EnvelopesPgRepository(db);
    const outbound = new OutboundEmailsPgRepository(db);
    const ownerId = randomUUID();
    await pg.query('insert into auth.users (id) values ($1)', [ownerId]);
    const envelope = await envelopes.createDraft({
      owner_id: ownerId,
      title: 'Sign link window',
      short_code: randomBytes(8).toString('hex').slice(0, 13),
      tc_version: 'tc-v1',
      privacy_version: 'pp-v1',
      expires_at: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
    });
    const signer = await envelopes.addSigner(envelope.id, {
      email: `ada-${ownerId.slice(0, 8)}@example.com`,
      name: 'Ada',
      color: '#112233',
    });
    const inviteUrl = 'https://app.example/sign/original?t=invite-token';
    const newerUrl = 'https://app.example/sign/original?t=newer-token';
    const invite = await outbound.insert({
      envelope_id: envelope.id,
      signer_id: signer.id,
      kind: 'invite',
      to_email: 'ada@example.com',
      to_name: 'Ada',
      dedupe_key: `invite:${signer.id}`,
      payload: { sign_url: inviteUrl },
    });
    const blanks = [];
    for (let i = 0; i < 21; i += 1) {
      blanks.push(
        await outbound.insert({
          envelope_id: envelope.id,
          signer_id: signer.id,
          kind: 'reminder',
          to_email: 'ada@example.com',
          to_name: 'Ada',
          dedupe_key: `blank:${signer.id}:${i}`,
          payload: { automated: true },
        }),
      );
    }
    const base = Date.now() - 86_400_000;
    await pg.query(`update public.outbound_emails set created_at = $1::timestamptz where id = $2`, [
      new Date(base).toISOString(),
      invite.id,
    ]);
    for (let i = 0; i < blanks.length; i += 1) {
      const row = blanks[i];
      if (!row) continue;
      await pg.query(
        `update public.outbound_emails set created_at = $1::timestamptz where id = $2`,
        [new Date(base + (i + 1) * 1000).toISOString(), row.id],
      );
    }
    const latestBlank = blanks[blanks.length - 1];
    expect(await outbound.findLatestSignUrl(envelope.id, signer.id, latestBlank?.id)).toBe(
      inviteUrl,
    );

    const newer = await outbound.insert({
      envelope_id: envelope.id,
      signer_id: signer.id,
      kind: 'reminder',
      to_email: 'ada@example.com',
      to_name: 'Ada',
      dedupe_key: `newer:${signer.id}`,
      payload: { sign_url: newerUrl },
    });
    await pg.query(`update public.outbound_emails set created_at = $1::timestamptz where id = $2`, [
      new Date(base + 80_000).toISOString(),
      newer.id,
    ]);
    expect(await outbound.findLatestSignUrl(envelope.id, signer.id)).toBe(newerUrl);
    expect(await outbound.findLatestSignUrl(envelope.id, signer.id, newer.id)).toBe(inviteUrl);
  }, 60_000);

  it('records one reminder_sent per email when sweeps overlap', async () => {
    if (!pool || !db) throw new Error('postgres harness did not start');
    const pg = pool;
    const database = db;
    const envelopes = new EnvelopesPgRepository(database);
    const outbound = new OutboundEmailsPgRepository(database);
    const ownerId = randomUUID();
    await pg.query('insert into auth.users (id) values ($1)', [ownerId]);

    const raced = await sentEnvelope(envelopes, ownerId, 1);
    const racedSigner = raced.signers[0];
    if (!racedSigner) throw new Error('missing signer');
    const now = new Date();
    const aged = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    await pg.query(
      `update public.envelope_signers set access_token_sent_at = $1 where envelope_id = $2`,
      [aged, raced.envelope.id],
    );
    const claims = await Promise.all(
      Array.from({ length: 5 }, () => envelopes.tryClaimReminder(racedSigner.id, now)),
    );
    expect(claims.filter(Boolean)).toHaveLength(1);

    const sent = await sentEnvelope(envelopes, ownerId, 6);
    await pg.query(
      `update public.envelope_signers set access_token_sent_at = $1 where envelope_id = $2`,
      [aged, sent.envelope.id],
    );
    for (const signer of sent.signers) {
      await outbound.insert({
        envelope_id: sent.envelope.id,
        signer_id: signer.id,
        kind: 'invite',
        to_email: signer.email,
        to_name: signer.name,
        dedupe_key: `invite:${signer.id}`,
        payload: { sign_url: `https://app.example/sign/${sent.envelope.id}?t=${signer.id}` },
      });
    }
    await pg.query(`update public.outbound_emails set created_at = $1 where envelope_id = $2`, [
      aged,
      sent.envelope.id,
    ]);

    const scheduler = new ReminderSchedulerService(envelopes, outbound, {
      APP_PUBLIC_URL: 'https://seald.example',
    } as AppEnv);
    const sweeps = await Promise.all(
      Array.from({ length: 5 }, () => scheduler.enqueueDue(now, 50)),
    );
    expect(sweeps.reduce((sum, sweep) => sum + sweep.queued, 0)).toBe(sent.signers.length);

    const templates = new TemplateService();
    templates.onModuleInit();
    const dispatcher = new EmailDispatcherService(
      outbound,
      new RecordingSender(),
      templates,
      envelopes,
      {
        EMAIL_FROM_ADDRESS: 'no-reply@seald.example',
        EMAIL_FROM_NAME: 'Seald',
        EMAIL_LEGAL_ENTITY: 'Seald',
        EMAIL_LEGAL_POSTAL: 'Postal',
        EMAIL_PRIVACY_URL: 'https://seald.example/legal/privacy',
        EMAIL_PREFERENCES_URL: 'mailto:privacy@seald.example',
      } as AppEnv,
    );
    await dispatcher.flushOnce(50);

    const reminderRows = await pg.query<{ n: string }>(
      `select count(*)::text as n from public.outbound_emails
        where envelope_id = $1 and kind = 'reminder'`,
      [sent.envelope.id],
    );
    const events = await pg.query<{ n: string }>(
      `select count(*)::text as n from public.envelope_events
        where envelope_id = $1 and event_type = 'reminder_sent'`,
      [sent.envelope.id],
    );
    expect(Number(reminderRows.rows[0]?.n)).toBe(sent.signers.length);
    expect(Number(events.rows[0]?.n)).toBe(sent.signers.length);
  }, 60_000);
});

class RecordingSender extends EmailSender {
  async send(): Promise<EmailSendResult> {
    return { providerId: 'pg-test' };
  }
}

async function sentEnvelope(
  envelopes: EnvelopesPgRepository,
  ownerId: string,
  signerCount: number,
): Promise<{
  envelope: { id: string };
  signers: Array<{ id: string; email: string; name: string }>;
}> {
  const envelope = await envelopes.createDraft({
    owner_id: ownerId,
    title: 'Concurrent reminders',
    short_code: randomBytes(8).toString('hex').slice(0, 13),
    tc_version: 'tc-v1',
    privacy_version: 'pp-v1',
    expires_at: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
  });
  const signers = [];
  for (let i = 0; i < signerCount; i += 1) {
    const email = `signer-${envelope.id.slice(0, 8)}-${i}@example.com`;
    const signer = await envelopes.addSigner(envelope.id, {
      email,
      name: `Signer ${i}`,
      color: '#112233',
    });
    signers.push({ id: signer.id, email, name: `Signer ${i}` });
  }
  const sent = await envelopes.sendDraft({
    envelope_id: envelope.id,
    signer_tokens: signers.map((signer) => ({
      signer_id: signer.id,
      access_token_hash: randomBytes(32).toString('hex'),
    })),
    sender_email: 'sender@example.com',
    sender_name: 'Sender',
  });
  if (!sent) throw new Error('sendDraft failed');
  return { envelope, signers };
}

async function readySigner(
  repo: EnvelopesPgRepository,
  envelopeId: string,
  email: string,
): Promise<{ id: string }> {
  const signer = await repo.addSigner(envelopeId, { email, name: email, color: '#112233' });
  await repo.acceptTerms(signer.id);
  await repo.setSignerSignature(signer.id, {
    signature_format: 'typed',
    signature_image_path: `sigs/${signer.id}.png`,
  });
  return signer;
}

async function waitForEnvelopeLockWaiters(pool: Pool, expected: number): Promise<void> {
  const deadline = Date.now() + 8_000;
  let last = '[]';
  while (Date.now() < deadline) {
    const res: QueryResult<{ query: string | null }> = await pool.query(
      `select left(query, 240) as query
         from pg_stat_activity
        where application_name = 'submit-signer-concurrency'
          and pid <> pg_backend_pid()
          and state = 'active'
          and wait_event_type = 'Lock'
          and query ilike '%for update%'`,
    );
    last = JSON.stringify(res.rows);
    if ((res.rowCount ?? 0) >= expected) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
  throw new Error(
    `expected ${expected} sessions waiting on the envelope FOR UPDATE; saw ${last}. ` +
      'submitSigner must lock the envelope row or the two final signatures can both count total - 1 and never seal.',
  );
}
