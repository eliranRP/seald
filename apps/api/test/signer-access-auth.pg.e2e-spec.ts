import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { ACCESS_CODE_POLICY, VERIFICATION_CHECK_EMAIL_OTP } from 'shared';
import type { Database } from '../db/schema';
import { EnvelopesPgRepository } from '../src/envelopes/envelopes.repository.pg';
import type { AttemptOutcome } from '../src/signing/access-auth/access-auth.repository';
import { AccessAuthPgRepository } from '../src/signing/access-auth/access-auth.repository.pg';
import { accessCodeMatches, hashAccessCode } from '../src/signing/access-auth/access-code';

/**
 * WP-10 signer access code against real Postgres (migration 0026):
 *
 *   1. Concurrency on verify: many wrong guesses at once are counted
 *      exactly (the challenge row lock), the 5th locks the code, and no
 *      guess past the limit is evaluated. Many right guesses at once:
 *      exactly one succeeds and consumes the code; `email_otp` is added
 *      to verification_checks once.
 *   2. Concurrency on send: parallel sends for one signer pass the
 *      cooldown once (signer row lock).
 *   3. Arm guard: no code is minted for a superseded challenge or a
 *      signer that can no longer sign. Settings are draft-only.
 *   4. Schema: RLS on, enum labels present, and up → down → up.
 *
 * Own scratch database on the server SUBMIT_SIGNER_DATABASE_URL names;
 * skipped when unset locally, fails in CI when unset.
 */
const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;
const DB_NAME = `signer_access_auth_${randomBytes(4).toString('hex')}`;
const MIGRATIONS_DIR = resolve(__dirname, '../db/migrations');
const UP = join(MIGRATIONS_DIR, '0026_signer_access_auth.sql');
const DOWN = join(MIGRATIONS_DIR, 'down', '0026_signer_access_auth_down.sql');
const KEY = 'o'.repeat(48);

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('SUBMIT_SIGNER_DATABASE_URL is required in CI for the signer access pg spec');
}

const describePg = databaseUrl ? describe : describe.skip;

describePg('signer access code (real Postgres)', () => {
  let admin: Pool | undefined;
  let pool: Pool | undefined;
  let dedicatedUrl = '';
  let db: Kysely<Database>;
  let envelopes: EnvelopesPgRepository;
  let repo: AccessAuthPgRepository;
  let ownerId: string;

  async function psqlFile(file: string): Promise<void> {
    await execFileAsync('psql', [dedicatedUrl, '-v', 'ON_ERROR_STOP=1', '-1', '-q', '-f', file]);
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('SUBMIT_SIGNER_DATABASE_URL missing');
    admin = new Pool({ connectionString: databaseUrl, max: 1 });
    admin.on('error', () => undefined);
    await admin.query(`create database ${DB_NAME}`);
    const dedicated = new URL(databaseUrl);
    dedicated.pathname = `/${DB_NAME}`;
    dedicatedUrl = dedicated.toString();
    pool = new Pool({ connectionString: dedicatedUrl, max: 20 });
    // The final `drop database … with (force)` may end a connection the
    // pool is still closing; that is expected teardown noise.
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
    envelopes = new EnvelopesPgRepository(db);
    repo = new AccessAuthPgRepository(db);
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

  /** A sent envelope with one signer whose access code is required. */
  async function sentSigner(): Promise<{ envelopeId: string; signerId: string }> {
    const envelope = await envelopes.createDraft({
      owner_id: ownerId,
      title: 'Coded',
      short_code: randomBytes(8).toString('hex').slice(0, 13),
      tc_version: 'tc-v1',
      privacy_version: 'pp-v1',
      expires_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    });
    const signer = await envelopes.addSigner(envelope.id, {
      email: `jane-${envelope.id.slice(0, 8)}@example.com`,
      name: 'Jane',
      color: '#112233',
    });
    expect(await repo.setSettings(envelope.id, { access_auth: 'email_otp' })).toBe(true);
    const sent = await envelopes.sendDraft({
      envelope_id: envelope.id,
      sender_email: 'sender@example.com',
      sender_name: 'Sender',
    });
    if (!sent) throw new Error('send failed');
    return { envelopeId: envelope.id, signerId: signer.id };
  }

  /** Open + arm a challenge with a known code. */
  async function armed(envelopeId: string, signerId: string, code: string): Promise<string> {
    const created = await repo.createChallenge({
      envelope_id: envelopeId,
      signer_id: signerId,
      purpose: 'access',
      now: new Date(),
      ttl_seconds: ACCESS_CODE_POLICY.ttlSeconds,
    });
    if (!created.ok) throw new Error(`createChallenge refused: ${created.reason}`);
    const id = created.challenge.id;
    const ok = await repo.armChallenge({
      challenge_id: id,
      signer_id: signerId,
      purpose: 'access',
      code_hash: hashAccessCode(
        KEY,
        { challenge_id: id, signer_id: signerId, purpose: 'access' },
        code,
      ),
      now: new Date(),
      ttl_seconds: ACCESS_CODE_POLICY.ttlSeconds,
    });
    expect(ok).not.toBeNull();
    return id;
  }

  function attempt(signerId: string, code: string): Promise<AttemptOutcome> {
    return repo.attempt({
      signer_id: signerId,
      purpose: 'access',
      now: new Date(),
      max_attempts: ACCESS_CODE_POLICY.maxAttempts,
      verification_check: VERIFICATION_CHECK_EMAIL_OTP,
      matches: (c) =>
        accessCodeMatches(
          KEY,
          { challenge_id: c.id, signer_id: signerId, purpose: 'access' },
          code,
          c.code_hash,
        ),
    });
  }

  async function backdate(signerId: string, seconds: number): Promise<void> {
    await pool!.query(
      `update public.signer_otp_challenges
          set created_at = created_at - make_interval(secs => $2)
        where signer_id = $1`,
      [signerId, seconds],
    );
  }

  it('counts concurrent wrong guesses exactly and locks on the 5th', async () => {
    const { envelopeId, signerId } = await sentSigner();
    const id = await armed(envelopeId, signerId, '123456');
    const outcomes = await Promise.all(
      Array.from({ length: 12 }, () => attempt(signerId, '654321')),
    );
    const kinds = outcomes.map((o) => o.kind).sort();
    expect(kinds.filter((k) => k === 'mismatch')).toHaveLength(ACCESS_CODE_POLICY.maxAttempts - 1);
    expect(kinds.filter((k) => k === 'locked_now')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'locked')).toHaveLength(12 - ACCESS_CODE_POLICY.maxAttempts);
    const row = await pool!.query<{ attempts: number; locked_at: Date | null }>(
      'select attempts, locked_at from public.signer_otp_challenges where id = $1',
      [id],
    );
    expect(row.rows[0]?.attempts).toBe(ACCESS_CODE_POLICY.maxAttempts);
    expect(row.rows[0]?.locked_at).not.toBeNull();
    // Locked: the right code no longer works either.
    expect((await attempt(signerId, '123456')).kind).toBe('locked');
  });

  it('lets exactly one of many concurrent right guesses succeed', async () => {
    const { envelopeId, signerId } = await sentSigner();
    const id = await armed(envelopeId, signerId, '000777');
    const outcomes = await Promise.all(
      Array.from({ length: 8 }, () => attempt(signerId, '000777')),
    );
    const kinds = outcomes.map((o) => o.kind);
    expect(kinds.filter((k) => k === 'verified')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'not_requested')).toHaveLength(7);
    const row = await pool!.query<{ consumed_at: Date | null; attempts: number }>(
      'select consumed_at, attempts from public.signer_otp_challenges where id = $1',
      [id],
    );
    expect(row.rows[0]?.consumed_at).not.toBeNull();
    expect(row.rows[0]?.attempts).toBe(0);
    const checks = await pool!.query<{ verification_checks: string[] }>(
      'select verification_checks from public.envelope_signers where id = $1',
      [signerId],
    );
    expect(checks.rows[0]?.verification_checks).toEqual([VERIFICATION_CHECK_EMAIL_OTP]);
    // A second verified code does not duplicate the check.
    await backdate(signerId, 61);
    await armed(envelopeId, signerId, '000888');
    expect((await attempt(signerId, '000888')).kind).toBe('verified');
    const again = await pool!.query<{ verification_checks: string[] }>(
      'select verification_checks from public.envelope_signers where id = $1',
      [signerId],
    );
    expect(again.rows[0]?.verification_checks).toEqual([VERIFICATION_CHECK_EMAIL_OTP]);
  });

  it('lets only one of many parallel sends pass the cooldown', async () => {
    const { envelopeId, signerId } = await sentSigner();
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        repo.createChallenge({
          envelope_id: envelopeId,
          signer_id: signerId,
          purpose: 'access',
          now: new Date(),
          ttl_seconds: ACCESS_CODE_POLICY.ttlSeconds,
        }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === 'cooldown')).toHaveLength(5);
    // The hourly cap counts every send of the past hour.
    for (let i = 1; i < ACCESS_CODE_POLICY.maxSendsPerHour; i++) {
      await backdate(signerId, 61);
      const next = await repo.createChallenge({
        envelope_id: envelopeId,
        signer_id: signerId,
        purpose: i % 2 ? 'action' : 'access',
        now: new Date(),
        ttl_seconds: ACCESS_CODE_POLICY.ttlSeconds,
      });
      expect(next.ok).toBe(true);
    }
    await backdate(signerId, 61);
    const capped = await repo.createChallenge({
      envelope_id: envelopeId,
      signer_id: signerId,
      purpose: 'access',
      now: new Date(),
      ttl_seconds: ACCESS_CODE_POLICY.ttlSeconds,
    });
    expect(capped).toMatchObject({ ok: false, reason: 'rate_limited' });
    // Only the newest code per purpose is open.
    const open = await pool!.query<{ purpose: string; n: string }>(
      `select purpose, count(*)::text as n from public.signer_otp_challenges
        where signer_id = $1 and superseded_at is null group by purpose order by purpose`,
      [signerId],
    );
    expect(open.rows).toEqual([
      { purpose: 'access', n: '1' },
      { purpose: 'action', n: '1' },
    ]);
  });

  it('never arms a replaced challenge or one whose signer cannot sign; settings are draft-only', async () => {
    const { envelopeId, signerId } = await sentSigner();
    expect(await repo.setSettings(envelopeId, { access_auth: 'none' })).toBe(false);
    const first = await repo.createChallenge({
      envelope_id: envelopeId,
      signer_id: signerId,
      purpose: 'access',
      now: new Date(),
      ttl_seconds: 600,
    });
    if (!first.ok) throw new Error('refused');
    await backdate(signerId, 61);
    const second = await repo.createChallenge({
      envelope_id: envelopeId,
      signer_id: signerId,
      purpose: 'access',
      now: new Date(),
      ttl_seconds: 600,
    });
    if (!second.ok) throw new Error('refused');
    const arm = (challenge_id: string) =>
      repo.armChallenge({
        challenge_id,
        signer_id: signerId,
        purpose: 'access',
        code_hash: 'a'.repeat(64),
        now: new Date(),
        ttl_seconds: 600,
      });
    expect(await arm(first.challenge.id)).toBeNull();
    // Wrong purpose binding is refused too.
    expect(
      await repo.armChallenge({
        challenge_id: second.challenge.id,
        signer_id: signerId,
        purpose: 'action',
        code_hash: 'a'.repeat(64),
        now: new Date(),
        ttl_seconds: 600,
      }),
    ).toBeNull();
    await pool!.query(`update public.envelopes set status = 'canceled' where id = $1`, [
      envelopeId,
    ]);
    expect(await arm(second.challenge.id)).toBeNull();
    const settings = await repo.getSettings(envelopeId);
    expect(settings).toEqual({
      access_auth: 'email_otp',
      action_auth: 'none',
      signers: [{ signer_id: signerId, access_auth: null, action_auth: null }],
    });
  });

  it('0026: RLS on, enum labels present, and up → down → up', async () => {
    const rls = await pool!.query<{ relrowsecurity: boolean }>(
      `select relrowsecurity from pg_class where oid = 'public.signer_otp_challenges'::regclass`,
    );
    expect(rls.rows[0]?.relrowsecurity).toBe(true);
    const labels = async (type: string): Promise<string[]> =>
      (
        await pool!.query<{ enumlabel: string }>(
          `select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
            where t.typname = $1`,
          [type],
        )
      ).rows.map((r) => r.enumlabel);
    expect(await labels('event_type')).toEqual(
      expect.arrayContaining(['access_code_sent', 'access_code_verified', 'access_code_failed']),
    );
    expect(await labels('email_kind')).toContain('access_code');

    // Rows of the new kinds exist when the rollback runs.
    const { envelopeId, signerId } = await sentSigner();
    await envelopes.appendEvent({
      envelope_id: envelopeId,
      signer_id: signerId,
      actor_kind: 'signer',
      event_type: 'access_code_sent',
      metadata: { method: 'email_otp', purpose: 'access', to_masked: 'j***@example.com' },
    });
    await pool!.query(
      `insert into public.outbound_emails (envelope_id, signer_id, kind, to_email, to_name, payload)
       values ($1, $2, 'access_code', 'jane@example.com', 'Jane', '{"challenge_id":"x"}')`,
      [envelopeId, signerId],
    );

    await psqlFile(DOWN);
    expect(await labels('event_type')).not.toContain('access_code_sent');
    expect(await labels('event_type')).toContain('step_started');
    expect(await labels('email_kind')).not.toContain('access_code');
    expect(await labels('email_kind')).toContain('api_key_created');
    const table = await pool!.query(`select to_regclass('public.signer_otp_challenges') as t`);
    expect(table.rows[0].t).toBeNull();
    const cols = await pool!.query(
      `select column_name from information_schema.columns
        where table_name in ('envelopes', 'envelope_signers') and column_name in ('access_auth', 'action_auth')`,
    );
    expect(cols.rows).toHaveLength(0);
    // Down is idempotent.
    await psqlFile(DOWN);

    await psqlFile(UP);
    await psqlFile(UP);
    expect(await labels('email_kind')).toContain('access_code');
    const back = await pool!.query(`select to_regclass('public.signer_otp_challenges') as t`);
    expect(back.rows[0].t).not.toBeNull();
    const defaults = await pool!.query<{ access_auth: string }>(
      'select access_auth from public.envelopes where id = $1',
      [envelopeId],
    );
    expect(defaults.rows[0]?.access_auth).toBe('none');
  });
});
