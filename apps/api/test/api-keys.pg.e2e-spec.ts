import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { NotFoundException } from '@nestjs/common';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { AuthUser } from '../src/auth/auth-user';
import { ApiKeysPgRepository } from '../src/api-keys/api-keys.repository.pg';
import { ApiKeysService } from '../src/api-keys/api-keys.service';
import type { AppEnv } from '../src/config/env.schema';
import type { Database } from '../db/schema';
import { InMemoryOutboundEmailsRepository } from './in-memory-outbound-emails-repository';

/**
 * Cap and IDOR against real Postgres 17. pg-mem does not take
 * pg_advisory_xact_lock, so the live-key cap lock is only real here.
 * CI's API e2e job sets SUBMIT_SIGNER_DATABASE_URL. Without it the
 * suite skips; in CI a missing URL fails the file.
 */
const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;
const DB_NAME = 'api_keys_0022_ci';

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error(
    'SUBMIT_SIGNER_DATABASE_URL is required in CI so api key cap and IDOR run against real Postgres',
  );
}

const describePg = databaseUrl ? describe : describe.skip;

const ENV = { APP_PUBLIC_URL: 'https://seald.nromomentum.com' } as AppEnv;

describePg('api keys cap and IDOR (real Postgres)', () => {
  let admin: Pool | undefined;
  let pool: Pool | undefined;
  let db: Kysely<Database> | undefined;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('SUBMIT_SIGNER_DATABASE_URL missing');
    admin = new Pool({
      connectionString: databaseUrl,
      max: 1,
      application_name: 'api-keys-0022-admin',
    });
    await admin.query(`drop database if exists ${DB_NAME} with (force)`);
    await admin.query(`create database ${DB_NAME}`);
    const dedicated = new URL(databaseUrl);
    dedicated.pathname = `/${DB_NAME}`;
    const dedicatedUrl = dedicated.toString();
    pool = new Pool({
      connectionString: dedicatedUrl,
      max: 8,
      application_name: 'api-keys-0022',
    });
    await pool.query(`
      create schema if not exists auth;
      create table if not exists auth.users (id uuid primary key);
      create or replace function auth.uid() returns uuid
        language sql stable as $$ select null::uuid $$;
      do $$
      begin
        if not exists (select 1 from pg_roles where rolname = 'anon') then
          create role anon nologin;
        end if;
        if not exists (select 1 from pg_roles where rolname = 'authenticated') then
          create role authenticated nologin;
        end if;
      end $$;
      alter default privileges in schema public grant all on tables to anon, authenticated;
    `);
    const migrationsDir = resolve(__dirname, '../db/migrations');
    const script = resolve(__dirname, '../scripts/migrate.sh');
    await execFileAsync('sh', [script], {
      env: { ...process.env, DATABASE_URL: dedicatedUrl, MIGRATIONS_DIR: migrationsDir },
    });
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  }, 180_000);

  afterAll(async () => {
    await db?.destroy();
    if (admin) {
      await admin.query(`drop database if exists ${DB_NAME} with (force)`);
      await admin.end();
    }
  });

  function service(): { repo: ApiKeysPgRepository; svc: ApiKeysService } {
    if (!db) throw new Error('postgres harness did not start');
    const repo = new ApiKeysPgRepository(db);
    const svc = new ApiKeysService(repo, new InMemoryOutboundEmailsRepository(), ENV);
    return { repo, svc };
  }

  it('revokes anon and authenticated grants on api_keys', async () => {
    if (!pool) throw new Error('postgres harness did not start');
    const grants = await pool.query<{ anon: boolean; authenticated: boolean }>(
      `select
         has_table_privilege('anon', 'public.api_keys', 'SELECT') as anon,
         has_table_privilege('authenticated', 'public.api_keys', 'SELECT') as authenticated`,
    );
    expect(grants.rows[0]?.anon).toBe(false);
    expect(grants.rows[0]?.authenticated).toBe(false);
    const nullable = await pool.query<{ is_nullable: string }>(
      `select is_nullable from information_schema.columns
        where table_schema = 'public' and table_name = 'api_keys' and column_name = 'expires_at'`,
    );
    expect(nullable.rows[0]?.is_nullable).toBe('NO');
  });

  it('lets 10 of 15 concurrent creates through, and hides another owner', async () => {
    if (!pool) throw new Error('postgres harness did not start');
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    await pool.query('insert into auth.users (id) values ($1), ($2)', [ownerA, ownerB]);
    const { repo, svc } = service();
    const userA: AuthUser = { id: ownerA, email: 'a@example.com', provider: 'email' };
    const userB: AuthUser = { id: ownerB, email: 'b@example.com', provider: 'email' };

    const results = await Promise.allSettled(
      Array.from({ length: 15 }, () => svc.create(userA, {})),
    );
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(10);
    expect(rejected).toHaveLength(5);
    for (const result of rejected) {
      expect((result as PromiseRejectedResult).reason).toMatchObject({ message: 'key_limit' });
    }
    expect(await svc.list(userA)).toHaveLength(10);
    expect(await svc.list(userB)).toHaveLength(0);

    const created = fulfilled[0];
    if (created?.status !== 'fulfilled') throw new Error('expected a created key');
    await expect(svc.revoke(userB, created.value.id, true)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(svc.revoke(userA, randomUUID(), true)).rejects.toBeInstanceOf(NotFoundException);
    const row = await repo.findByIdForOwner(created.value.id, ownerA);
    expect(row?.revokedAt).toBeNull();

    expect(await repo.deleteAllByOwner(ownerA)).toBe(10);
    expect(await svc.list(userA)).toHaveLength(0);
  });
});
