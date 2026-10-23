import { execFile } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from '../db/schema';
import { ApiKeyAuthService } from '../src/api-keys/api-key-auth.service';
import { generateApiKey } from '../src/api-keys/api-key-secret';
import type { ApiKeyRecord, CreateApiKeyRowInput } from '../src/api-keys/api-keys.repository';
import { ApiKeysPgRepository } from '../src/api-keys/api-keys.repository.pg';
import { ApiKeysService } from '../src/api-keys/api-keys.service';
import type { AppEnv } from '../src/config/env.schema';
import type { InsertOutboundEmailInput } from '../src/email/outbound-emails.repository';

/**
 * ApiKeysPgRepository and migration 0028 against real Postgres: the
 * advisory-lock cap under concurrency, the live-name backstop, the
 * key + email transaction, revoke keeping the row, last_used_at
 * throttling, account-deletion cascade, RLS, and the down script.
 *
 * Same harness contract as seal-sweep.pg.e2e-spec.ts: its own database on
 * the server named by SUBMIT_SIGNER_DATABASE_URL; skipped when unset
 * locally, fails in CI when unset.
 */
const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;
// Unique per run: suites from parallel jobs share one Postgres server.
const DB_NAME = `api_keys_${randomBytes(4).toString('hex')}`;
const MIGRATIONS = resolve(__dirname, '../db/migrations');

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('SUBMIT_SIGNER_DATABASE_URL is required in CI for the api-keys pg spec');
}

const describePg = databaseUrl ? describe : describe.skip;
const DAY = 86_400_000;

describePg('api keys (real Postgres)', () => {
  let admin: Pool | undefined;
  let pool: Pool | undefined;
  let dedicatedUrl = '';
  let db: Kysely<Database>;
  let repo: ApiKeysPgRepository;

  async function migrate(): Promise<void> {
    await execFileAsync('sh', [resolve(__dirname, '../scripts/migrate.sh')], {
      env: { ...process.env, DATABASE_URL: dedicatedUrl, MIGRATIONS_DIR: MIGRATIONS },
    });
  }

  async function newOwner(): Promise<string> {
    const id = randomUUID();
    await pool!.query('insert into auth.users (id) values ($1)', [id]);
    return id;
  }

  function email(key: ApiKeyRecord): InsertOutboundEmailInput {
    return {
      kind: 'api_key_created',
      to_email: 'owner@example.com',
      to_name: '',
      dedupe_key: `api_key_created:${key.id}`,
      payload: { key_name: key.name, key_prefix: key.prefix },
    };
  }

  function input(ownerId: string, over: Partial<CreateApiKeyRowInput> = {}): CreateApiKeyRowInput {
    const g = generateApiKey();
    return {
      ownerId,
      name: null,
      prefix: g.prefix,
      keyHash: g.keyHash,
      scopes: ['envelopes:read'],
      expiresAt: new Date(Date.now() + 90 * DAY).toISOString(),
      alwaysRequireSignin: false,
      cap: 10,
      notification: email,
      ...over,
    };
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('SUBMIT_SIGNER_DATABASE_URL missing');
    admin = new Pool({ connectionString: databaseUrl, max: 1 });
    await admin.query(`drop database if exists ${DB_NAME} with (force)`);
    await admin.query(`create database ${DB_NAME}`);
    const dedicated = new URL(databaseUrl);
    dedicated.pathname = `/${DB_NAME}`;
    dedicatedUrl = dedicated.toString();
    pool = new Pool({ connectionString: dedicatedUrl, max: 20 });
    // The final `drop database … with (force)` may terminate a connection
    // the pool is still closing; that is expected teardown noise.
    pool.on('error', () => undefined);
    await pool.query(`
      create schema if not exists auth;
      create table if not exists auth.users (id uuid primary key);
      create or replace function auth.uid() returns uuid
        language sql stable as $$ select null::uuid $$;
    `);
    await migrate();
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
    repo = new ApiKeysPgRepository(db);
  }, 180_000);

  afterAll(async () => {
    await db?.destroy();
    if (admin) {
      await admin.query(`drop database if exists ${DB_NAME} with (force)`);
      await admin.end();
    }
  });

  it('creates the table with RLS on and the api_key_created email kind', async () => {
    const rls = await pool!.query<{ relrowsecurity: boolean }>(
      `select relrowsecurity from pg_class where oid = 'public.api_keys'::regclass`,
    );
    expect(rls.rows[0]?.relrowsecurity).toBe(true);
    const policies = await pool!.query(`select 1 from pg_policies where tablename = 'api_keys'`);
    expect(policies.rowCount).toBe(0);
    const kinds = await pool!.query<{ label: string }>(
      `select unnest(enum_range(null::email_kind))::text as label`,
    );
    expect(kinds.rows.map((r) => r.label)).toContain('api_key_created');
  });

  it('the up script is idempotent', async () => {
    await pool!.query(readFileSync(resolve(MIGRATIONS, '0028_api_keys.sql'), 'utf8'));
    await pool!.query(readFileSync(resolve(MIGRATIONS, '0028_api_keys.sql'), 'utf8'));
  });

  it('inserts the key and its email in one transaction, naming it Key 1', async () => {
    const owner = await newOwner();
    const result = await repo.createWithinCap(input(owner));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.key).toMatchObject({
      ownerId: owner,
      name: 'Key 1',
      scopes: ['envelopes:read'],
      requireOwnerApproval: true,
      allowNewRecipients: false,
      revokedAt: null,
    });
    const mails = await pool!.query(
      `select kind::text, payload, envelope_id from outbound_emails where dedupe_key = $1`,
      [`api_key_created:${result.key.id}`],
    );
    expect(mails.rows).toEqual([
      {
        kind: 'api_key_created',
        payload: { key_name: 'Key 1', key_prefix: result.key.prefix },
        envelope_id: null,
      },
    ]);
  });

  it('rolls the key back when the email insert fails', async () => {
    const owner = await newOwner();
    const bad = (key: ApiKeyRecord): InsertOutboundEmailInput => ({
      ...email(key),
      // assertNoSignerToken refuses this payload inside the transaction.
      payload: { sign_url: 'https://x/sign/a?t=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
    });
    await expect(repo.createWithinCap(input(owner, { notification: bad }))).rejects.toThrow();
    expect(await repo.listLive(owner)).toHaveLength(0);
  });

  it('enforces the cap of 10 under concurrent creates, with unique Key N names', async () => {
    const owner = await newOwner();
    const results = await Promise.all(
      Array.from({ length: 15 }, () => repo.createWithinCap(input(owner))),
    );
    const ok = results.filter((r) => r.ok);
    const capped = results.filter((r) => !r.ok && r.reason === 'cap_reached');
    expect(ok).toHaveLength(10);
    expect(capped).toHaveLength(5);
    const names = (await repo.listLive(owner)).map((k) => k.name).sort();
    expect(new Set(names).size).toBe(10);
    expect(names).toEqual(Array.from({ length: 10 }, (_, i) => `Key ${i + 1}`).sort());
    const mails = await pool!.query(
      `select count(*)::int as n from outbound_emails where kind = 'api_key_created' and payload->>'key_prefix' = any($1)`,
      [(await repo.listLive(owner)).map((k) => k.prefix)],
    );
    expect(mails.rows[0]?.n).toBe(10);
  });

  it('one live name per owner (case-insensitive), even when racing', async () => {
    const owner = await newOwner();
    const results = await Promise.all(
      ['Laptop', 'laptop', 'LAPTOP', 'Laptop'].map((name) =>
        repo.createWithinCap(input(owner, { name })),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === 'name_taken')).toHaveLength(3);
  });

  it('the partial unique index is the backstop for live names', async () => {
    const owner = await newOwner();
    await repo.createWithinCap(input(owner, { name: 'Bot' }));
    const g = generateApiKey();
    await expect(
      pool!.query(
        `insert into api_keys (owner_id, name, prefix, key_hash, scopes, expires_at)
         values ($1, 'BOT', $2, $3, '{envelopes:read}', now() + interval '1 day')`,
        [owner, g.prefix, g.keyHash],
      ),
    ).rejects.toMatchObject({ code: '23505', constraint: 'api_keys_owner_name_live_idx' });
  });

  it('maps a prefix clash to prefix_taken, across owners and revoked rows', async () => {
    const a = await newOwner();
    const b = await newOwner();
    const first = input(a);
    const r1 = await repo.createWithinCap(first);
    expect(r1.ok).toBe(true);
    if (r1.ok) await repo.revoke(a, r1.key.id, new Date());
    const r2 = await repo.createWithinCap(input(b, { prefix: first.prefix }));
    expect(r2).toEqual({ ok: false, reason: 'prefix_taken' });
  });

  it('rejects a key_hash that is not 64 characters', async () => {
    const owner = await newOwner();
    await expect(
      pool!.query(
        `insert into api_keys (owner_id, name, prefix, key_hash, scopes) values ($1, 'x', 'p', 'short', '{}')`,
        [owner],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('revoke keeps the row; a second revoke is already_revoked; another owner gets not_found', async () => {
    const owner = await newOwner();
    const other = await newOwner();
    const r = await repo.createWithinCap(input(owner));
    if (!r.ok) throw new Error('create failed');
    expect(await repo.revoke(other, r.key.id, new Date())).toBe('not_found');
    expect(await repo.revoke(owner, r.key.id, new Date())).toBe('revoked');
    expect(await repo.revoke(owner, r.key.id, new Date())).toBe('already_revoked');
    const row = await repo.findByPrefix(r.key.prefix);
    expect(row?.revokedAt).not.toBeNull();
    expect(await repo.listLive(owner)).toHaveLength(0);
  });

  it('a revoked key frees a cap slot and its name', async () => {
    const owner = await newOwner();
    const made: ApiKeyRecord[] = [];
    for (let i = 0; i < 10; i += 1) {
      const r = await repo.createWithinCap(input(owner, i === 0 ? { name: 'Laptop' } : {}));
      if (r.ok) made.push(r.key);
    }
    expect(await repo.createWithinCap(input(owner))).toEqual({ ok: false, reason: 'cap_reached' });
    await repo.revoke(owner, made[0]!.id, new Date());
    const again = await repo.createWithinCap(input(owner, { name: 'laptop' }));
    expect(again.ok).toBe(true);
  });

  it('touchLastUsed writes at most once a minute', async () => {
    const owner = await newOwner();
    const r = await repo.createWithinCap(input(owner));
    if (!r.ok) throw new Error('create failed');
    const t0 = new Date('2026-10-22T12:00:00.000Z');
    await repo.touchLastUsed(r.key.id, t0);
    await repo.touchLastUsed(r.key.id, new Date(t0.getTime() + 30_000));
    expect((await repo.findByPrefix(r.key.prefix))?.lastUsedAt).toBe(t0.toISOString());
    const t2 = new Date(t0.getTime() + 61_000);
    await repo.touchLastUsed(r.key.id, t2);
    expect((await repo.findByPrefix(r.key.prefix))?.lastUsedAt).toBe(t2.toISOString());
  });

  it('service + verifier end to end: mint, verify, revoke', async () => {
    const owner = await newOwner();
    const env = { APP_PUBLIC_URL: 'https://seald.example' } as AppEnv;
    const svc = new ApiKeysService(repo, env);
    const auth = new ApiKeyAuthService(repo);
    const user = { id: owner, email: 'owner@example.com', provider: 'email', lastSignInAt: null };
    const created = await svc.create(user, {});
    const stored = await pool!.query<{ key_hash: string }>(
      'select key_hash from api_keys where id = $1',
      [created.key.id],
    );
    expect(JSON.stringify(stored.rows)).not.toContain(created.secret.slice(11));
    expect(await auth.verify(created.secret)).toMatchObject({
      ok: true,
      ownerId: owner,
      keyId: created.key.id,
      scopes: ['envelopes:read'],
    });
    expect((await repo.findByPrefix(created.key.prefix))?.lastUsedAt).not.toBeNull();
    await svc.revoke(user, created.key.id);
    expect(await auth.verify(created.secret)).toEqual({ ok: false, error: 'api_key_revoked' });
  });

  it('account deletion removes the rows: explicit delete and the auth.users cascade', async () => {
    const a = await newOwner();
    const b = await newOwner();
    await repo.createWithinCap(input(a));
    await repo.createWithinCap(input(a));
    await repo.createWithinCap(input(b));
    expect(await repo.deleteAllByOwner(a)).toBe(2);
    await pool!.query('delete from auth.users where id = $1', [b]);
    const left = await pool!.query('select 1 from api_keys where owner_id = any($1)', [[a, b]]);
    expect(left.rowCount).toBe(0);
  });

  it('the down script drops the table and the kind, keeps other kinds, and up re-applies', async () => {
    const before = await pool!.query<{ label: string }>(
      `select unnest(enum_range(null::email_kind))::text as label`,
    );
    await pool!.query(readFileSync(resolve(MIGRATIONS, 'down/0028_api_keys_down.sql'), 'utf8'));
    const table = await pool!.query(`select to_regclass('public.api_keys') as t`);
    expect(table.rows[0]?.t).toBeNull();
    const after = await pool!.query<{ label: string }>(
      `select unnest(enum_range(null::email_kind))::text as label`,
    );
    expect(after.rows.map((r) => r.label)).toEqual(
      before.rows.map((r) => r.label).filter((l) => l !== 'api_key_created'),
    );
    const mails = await pool!.query(
      `select 1 from outbound_emails where kind::text = 'api_key_created'`,
    );
    expect(mails.rowCount).toBe(0);
    // Idempotent down.
    await pool!.query(readFileSync(resolve(MIGRATIONS, 'down/0028_api_keys_down.sql'), 'utf8'));
    // The ledger row is gone, so the runner applies 0028 again.
    await migrate();
    const kinds = await pool!.query<{ label: string }>(
      `select unnest(enum_range(null::email_kind))::text as label`,
    );
    expect(kinds.rows.map((r) => r.label)).toContain('api_key_created');
    expect(
      (await pool!.query(`select to_regclass('public.api_keys') as t`)).rows[0]?.t,
    ).not.toBeNull();
  });
});
