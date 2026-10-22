import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool, type QueryResult } from 'pg';
import type { Database } from '../db/schema';
import type { AppEnv } from '../src/config/env.schema';
import { EmailDispatcherService } from '../src/email/email-dispatcher.service';
import { EmailSender, type EmailMessage, type EmailSendResult } from '../src/email/email-sender';
import { OutboundEmailsPgRepository } from '../src/email/outbound-emails.repository.pg';
import { TemplateService } from '../src/email/template.service';
import { EnvelopesPgRepository } from '../src/envelopes/envelopes.repository.pg';
import { ReminderSchedulerService } from '../src/reminders/reminder-scheduler.service';
import { SigningTokenService } from '../src/signing/signing-token.service';

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
 *
 * The same harness covers MCP Insert A (migration 0027) against real
 * Postgres: the outbox check constraint, the legacy `sign_url` scrub, and
 * the dispatcher minting a signer token per send.
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
  const ownedEnvelopeIds: string[] = [];

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

  afterEach(async () => {
    if (!pool || ownedEnvelopeIds.length === 0) return;
    const ids = ownedEnvelopeIds.splice(0);
    await pool.query(`delete from public.outbound_emails where envelope_id = any($1::uuid[])`, [
      ids,
    ]);
  });

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
    ownedEnvelopeIds.push(envelope.id);
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

  it('0027 scrubs legacy sign_url payloads and rejects new ones (idempotent re-run)', async () => {
    if (!pool || !db || !databaseUrl) throw new Error('postgres harness did not start');
    const pg = pool;
    const envelopes = new EnvelopesPgRepository(db);
    const ownerId = randomUUID();
    await pg.query('insert into auth.users (id) values ($1)', [ownerId]);
    const sent = await sentEnvelope(envelopes, ownerId, 1);
    ownedEnvelopeIds.push(sent.envelope.id);
    const signer = sent.signers[0];
    if (!signer) throw new Error('missing signer');

    const insertRaw = (payload: Record<string, unknown>, status = 'pending') =>
      pg.query(
        `insert into public.outbound_emails
           (envelope_id, signer_id, kind, to_email, to_name, payload, status)
         values ($1, $2, 'invite', $3, $4, $5::jsonb, $6::email_status)
         returning id`,
        [sent.envelope.id, signer.id, signer.email, signer.name, JSON.stringify(payload), status],
      );
    const legacyLink = `https://app.example/sign/${sent.envelope.id}?t=${'A'.repeat(43)}`;

    // The constraint is live: neither the legacy key nor a ?t= link is accepted.
    await expect(insertRaw({ sign_url: legacyLink })).rejects.toMatchObject({ code: '23514' });
    await expect(insertRaw({ cta: legacyLink })).rejects.toMatchObject({ code: '23514' });
    // User text that only looks like a query parameter is not a signing link.
    await expect(insertRaw({ envelope_title: 'Lease?t=final' })).resolves.toBeDefined();

    // Simulate rows queued before 0027: drop the constraint, store links,
    // then re-apply the migration file exactly as migrate.sh does.
    await pg.query(
      'alter table public.outbound_emails drop constraint outbound_emails_payload_no_signer_token',
    );
    const pending = await insertRaw({ sign_url: legacyLink, envelope_title: 'Legacy' });
    const delivered = await insertRaw({ sign_url: legacyLink, envelope_title: 'Legacy' }, 'sent');
    const migration = resolve(__dirname, '../db/migrations/0027_signer_token_dispatch.sql');
    for (let run = 0; run < 2; run += 1) {
      await execFileAsync('psql', [
        databaseUrl,
        '-v',
        'ON_ERROR_STOP=1',
        '-q',
        '-1',
        '-f',
        migration,
      ]);
    }

    const rows = await pg.query<{ payload: Record<string, unknown> }>(
      `select payload from public.outbound_emails where id = any($1::uuid[])`,
      [[pending.rows[0]?.id, delivered.rows[0]?.id]],
    );
    expect(rows.rows).toHaveLength(2);
    for (const row of rows.rows) {
      expect(row.payload).toEqual({ envelope_title: 'Legacy' });
    }
    const constraint = await pg.query<{ convalidated: boolean }>(
      `select convalidated from pg_constraint
        where conname = 'outbound_emails_payload_no_signer_token'`,
    );
    expect(constraint.rows).toEqual([{ convalidated: true }]);
    await expect(insertRaw({ sign_url: legacyLink })).rejects.toMatchObject({ code: '23514' });
  }, 60_000);

  it('mints the signer token at dispatch, re-mints per send, and kills older links', async () => {
    if (!pool || !db) throw new Error('postgres harness did not start');
    const pg = pool;
    const envelopes = new EnvelopesPgRepository(db);
    const outbound = new OutboundEmailsPgRepository(db);
    const tokens = new SigningTokenService();
    const ownerId = randomUUID();
    await pg.query('insert into auth.users (id) values ($1)', [ownerId]);
    const draft = await envelopes.createDraft({
      owner_id: ownerId,
      title: 'Minted at dispatch',
      short_code: randomBytes(8).toString('hex').slice(0, 13),
      tc_version: 'tc-v1',
      privacy_version: 'pp-v1',
      expires_at: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
    });
    ownedEnvelopeIds.push(draft.id);
    const signer = await envelopes.addSigner(draft.id, {
      email: `mint-${draft.id.slice(0, 8)}@example.com`,
      name: 'Mint',
      color: '#112233',
    });
    await envelopes.sendDraft({
      envelope_id: draft.id,
      sender_email: 'sender@example.com',
      sender_name: 'Sender',
    });
    const storedHash = async (): Promise<string | null> =>
      (
        await pg.query<{ h: string | null }>(
          'select access_token_hash as h from public.envelope_signers where id = $1',
          [signer.id],
        )
      ).rows[0]?.h ?? null;
    // A null hash means the link has not been sent yet.
    expect(await storedHash()).toBeNull();

    const base = { envelope_title: 'Minted at dispatch', public_url: 'https://seald.example' };
    await outbound.insert({
      envelope_id: draft.id,
      signer_id: signer.id,
      kind: 'invite',
      to_email: signer.email,
      to_name: signer.name,
      dedupe_key: `invite:${signer.id}`,
      payload: base,
    });
    const sender = new RecordingSender();
    const dispatcher = buildDispatcher(outbound, sender, envelopes, tokens);
    await dispatcher.flushOnce(50, { envelopeIds: [draft.id] });
    const inviteToken = sender.tokenAt(0, draft.id);
    expect(await storedHash()).toBe(tokens.hash(inviteToken));
    expect(await envelopes.findSignerByAccessTokenHash(tokens.hash(inviteToken))).not.toBeNull();

    await outbound.insert({
      envelope_id: draft.id,
      signer_id: signer.id,
      kind: 'reminder',
      to_email: signer.email,
      to_name: signer.name,
      dedupe_key: `reminder:${signer.id}`,
      payload: base,
    });
    await dispatcher.flushOnce(50, { envelopeIds: [draft.id] });
    const reminderToken = sender.tokenAt(1, draft.id);
    expect(reminderToken).not.toBe(inviteToken);
    expect(await storedHash()).toBe(tokens.hash(reminderToken));
    // The invite link stopped working once the reminder went out.
    expect(await envelopes.findSignerByAccessTokenHash(tokens.hash(inviteToken))).toBeNull();

    // Scanner: no stored payload holds a token, a ?t= link, or sign_url.
    const stored = await pg.query<{ payload: Record<string, unknown> }>(
      'select payload from public.outbound_emails where envelope_id = $1',
      [draft.id],
    );
    expect(stored.rows).toHaveLength(2);
    for (const row of stored.rows) {
      const text = JSON.stringify(row.payload);
      expect(text).not.toContain(inviteToken);
      expect(text).not.toContain(reminderToken);
      expect(text).not.toMatch(/[?&]t=/);
      expect(row.payload).not.toHaveProperty('sign_url');
    }
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
    ownedEnvelopeIds.push(raced.envelope.id);
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
    ownedEnvelopeIds.push(sent.envelope.id);
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
        payload: { envelope_title: 'Concurrent reminders' },
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

    const dispatcher = buildDispatcher(
      outbound,
      new RecordingSender(),
      envelopes,
      new SigningTokenService(),
    );
    await dispatcher.flushOnce(50, { envelopeIds: [sent.envelope.id] });

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
  readonly texts: string[] = [];

  async send(msg: EmailMessage): Promise<EmailSendResult> {
    this.texts.push(msg.text);
    return { providerId: 'pg-test' };
  }

  /** The signer token in the `index`-th sent message's link. */
  tokenAt(index: number, envelopeId: string): string {
    const match = new RegExp(`/sign/${envelopeId}\\?t=([A-Za-z0-9_-]{43})`).exec(
      this.texts[index] ?? '',
    );
    if (!match?.[1]) throw new Error(`no signing link in message ${index}`);
    return match[1];
  }
}

function buildDispatcher(
  outbound: OutboundEmailsPgRepository,
  sender: EmailSender,
  envelopes: EnvelopesPgRepository,
  tokens: SigningTokenService,
): EmailDispatcherService {
  const templates = new TemplateService();
  templates.onModuleInit();
  return new EmailDispatcherService(outbound, sender, templates, envelopes, tokens, {
    APP_PUBLIC_URL: 'https://seald.example',
    EMAIL_FROM_ADDRESS: 'no-reply@seald.example',
    EMAIL_FROM_NAME: 'Seald',
    EMAIL_LEGAL_ENTITY: 'Seald',
    EMAIL_LEGAL_POSTAL: 'Postal',
    EMAIL_PRIVACY_URL: 'https://seald.example/legal/privacy',
    EMAIL_PREFERENCES_URL: 'mailto:privacy@seald.example',
  } as AppEnv);
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
    sender_email: 'sender@example.com',
    sender_name: 'Sender',
  });
  if (!sent) throw new Error('sendDraft failed');
  // Stand-in for the invite dispatch, which mints each signer's token.
  for (const signer of signers) {
    const minted = await envelopes.rotateSignerAccessToken(
      signer.id,
      randomBytes(32).toString('hex'),
    );
    if (!minted) throw new Error('token mint failed');
  }
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
