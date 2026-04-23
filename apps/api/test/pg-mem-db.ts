import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { newDb, DataType, type IMemoryDb } from 'pg-mem';
import { Kysely, PostgresDialect } from 'kysely';
import type { Database } from '../db/schema';

/**
 * Boot an in-memory Postgres, apply the real 0001 migration (with small
 * substitutions so pg-mem can parse it), and return a Kysely<Database>
 * bound to it. Each call returns a fresh, isolated DB.
 *
 * Known pg-mem limitations we shim:
 *   - citext → text. The real uniqueness test in pg-mem is case-sensitive;
 *     we rely on the DTO's trim+lowercase to normalise emails at the HTTP
 *     boundary, so the app-level behaviour matches the real DB.
 *   - gen_random_uuid() → randomUUID() (pg-mem lacks pgcrypto).
 *   - char_length() works on text but not on citext; since we substitute
 *     citext for text, this is automatically satisfied.
 *   - triggers & plpgsql: pg-mem supports them, but the set_updated_at
 *     trigger is unnecessary for repo unit tests (we check updated_at
 *     behaviour only against the real DB in the manual smoke pass).
 *     We strip the trigger definition to avoid pg-mem's plpgsql coverage
 *     gaps.
 *   - references auth.users(id): we create a stub auth.users table first.
 *   - alter table ... enable row level security: not implemented by pg-mem;
 *     we strip this statement — the backend bypasses RLS anyway.
 *   - char_length(text): not built in to pg-mem; we register it.
 *   - text ~ text (regex match operator): not built in; we register it.
 */
export interface PgMemHandle {
  readonly db: Kysely<Database>;
  readonly mem: IMemoryDb;
  readonly pool: import('pg').Pool;
  readonly close: () => Promise<void>;
}

export function createPgMemDb(): PgMemHandle {
  const mem = newDb({ autoCreateForeignKeyIndices: true });

  mem.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    implementation: () => randomUUID(),
    impure: true,
  });

  // char_length() is not built into pg-mem — register a JS equivalent.
  mem.public.registerFunction({
    name: 'char_length',
    returns: DataType.integer,
    args: [DataType.text],
    implementation: (s: string | null) => (s == null ? null : s.length),
  });

  // The regex-match operator ~ is not built into pg-mem — register it.
  mem.public.registerOperator({
    operator: '~',
    left: DataType.text,
    right: DataType.text,
    returns: DataType.bool,
    implementation: (l: string | null, r: string | null) =>
      l != null && r != null && new RegExp(r).test(l),
  });

  // Stub the auth schema referenced by the migration.
  mem.public.none(`
    create schema if not exists auth;
    create table if not exists auth.users (id uuid primary key);
  `);

  const migrationPath = resolve(__dirname, '../db/migrations/0001_contacts.sql');
  const raw = readFileSync(migrationPath, 'utf8');
  const patched = raw
    // pg-mem doesn't implement the citext extension; make it a text alias.
    .replace(/create extension if not exists "citext";/g, '')
    .replace(/\bcitext\b/g, 'text')
    // Strip RLS enablement — not implemented by pg-mem.
    .replace(/alter table public\.contacts enable row level security;/g, '')
    // Strip the trigger + function definition — pg-mem has partial plpgsql support
    // and we don't assert on trigger-driven updated_at in unit tests.
    .replace(/create or replace function public\.set_updated_at\(\)[\s\S]*?\$\$;/g, '')
    .replace(
      /create trigger contacts_set_updated_at[\s\S]*?execute function public\.set_updated_at\(\);/g,
      '',
    );

  mem.public.none(patched);

  const { Pool } = mem.adapters.createPg();
  const pool = new Pool();
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

  return {
    db,
    mem,
    pool,
    async close() {
      await db.destroy();
    },
  };
}

/**
 * Seed a user id in the stub auth.users table so a foreign-key insert into
 * contacts.owner_id succeeds. Returns the same id for chaining.
 */
export async function seedUser(handle: PgMemHandle, id: string = randomUUID()): Promise<string> {
  handle.mem.public.none(`insert into auth.users (id) values ('${id}');`);
  return id;
}
