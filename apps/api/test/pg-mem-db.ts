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

  // Load 0002_envelopes.sql with pg-mem patches:
  // - strip citext extension (already aliased to text at global)
  // - citext → text (no-op since extension was stripped, but be explicit)
  // - strip RLS alters (pg-mem doesn't implement)
  // - strip envelopes_set_updated_at trigger (references function stripped from 0001)
  const migration0002Path = resolve(__dirname, '../db/migrations/0002_envelopes.sql');
  const raw0002 = readFileSync(migration0002Path, 'utf8');
  const patched0002 = raw0002
    .replace(/create extension if not exists "citext";/g, '')
    .replace(/\bcitext\b/g, 'text')
    .replace(/alter table public\.\w+ enable row level security;/g, '')
    .replace(
      /create trigger envelopes_set_updated_at[\s\S]*?execute function public\.set_updated_at\(\);/g,
      '',
    );
  mem.public.none(patched0002);

  // Load 0003_outbound_emails.sql with pg-mem patches:
  // - citext → text
  // - strip RLS alters
  const migration0003Path = resolve(__dirname, '../db/migrations/0003_outbound_emails.sql');
  const raw0003 = readFileSync(migration0003Path, 'utf8');
  const patched0003 = raw0003
    .replace(/\bcitext\b/g, 'text')
    .replace(/alter table public\.\w+ enable row level security;/g, '');
  mem.public.none(patched0003);

  // 0004 adds sender_email + sender_name columns — plain alter, no pg-mem
  // shims needed. Load as-is.
  const migration0004Path = resolve(__dirname, '../db/migrations/0004_envelope_sender.sql');
  mem.public.none(readFileSync(migration0004Path, 'utf8'));

  // 0005 adds initials_image_path + initials_format columns — plain alter.
  const migration0005Path = resolve(__dirname, '../db/migrations/0005_signer_initials.sql');
  mem.public.none(readFileSync(migration0005Path, 'utf8'));

  // 0007 adds prev_event_hash bytea column to envelope_events. Plain alter
  // table. Must be applied BEFORE migrations 0006 (which is itself a no-op
  // in pg-mem due to ALTER TYPE ADD VALUE) — actually order doesn't matter
  // here because 0007 is independent of 0006, but we keep numeric order for
  // parity with real Postgres' migration sequence.
  // 0006 adds 'session_invalidated_by_cancel' to the event_type enum.
  // pg-mem treats enums as plain text columns once the create-type runs, so
  // ALTER TYPE ... ADD VALUE is a no-op against the in-memory schema; we
  // load it for parity with real Postgres + so any future enum-aware
  // pg-mem release picks the new value up automatically.
  const migration0006Path = resolve(__dirname, '../db/migrations/0006_event_type_cancel.sql');
  try {
    mem.public.none(readFileSync(migration0006Path, 'utf8'));
  } catch {
    // pg-mem may not implement ALTER TYPE ADD VALUE — safe to ignore;
    // its enum check is text-based so the inserts still work.
  }

  const migration0007Path = resolve(__dirname, '../db/migrations/0007_event_chain_hash.sql');
  const raw0007 = readFileSync(migration0007Path, 'utf8');
  // pg-mem doesn't support `comment on column ...`. Strip it.
  const patched0007 = raw0007.replace(/comment on column[\s\S]*?;/g, '');
  mem.public.none(patched0007);

  const migration0008Path = resolve(__dirname, '../db/migrations/0008_templates.sql');
  const raw0008 = readFileSync(migration0008Path, 'utf8');
  // Same `comment on column` strip as 0007. Also drop `nulls last` from
  // the index DDL — pg-mem's parser chokes on it at create time. The
  // runtime ORDER BY in templates.repository.pg.ts re-applies `nulls
  // last` at query time, which pg-mem does support.
  const patched0008 = raw0008
    .replace(/comment on column[\s\S]*?;/g, '')
    .replace(/\s+nulls\s+last/gi, '')
    // Strip the updated_at trigger — the function `public.set_updated_at`
    // is not present here (we already stripped it in 0001) and pg-mem's
    // plpgsql coverage is limited. The repo overwrites updated_at
    // explicitly anyway.
    .replace(/alter table public\.templates enable row level security;/g, '')
    .replace(
      /create trigger templates_set_updated_at[\s\S]*?execute function public\.set_updated_at\(\);/g,
      '',
    );
  mem.public.none(patched0008);

  // 0009 — adds `tags` + `last_signers` jsonb columns to templates.
  // Strip the `comment on column` blocks (pg-mem unsupported) but keep
  // the column DDL itself.
  const migration0009Path = resolve(__dirname, '../db/migrations/0009_template_tags_signers.sql');
  const raw0009 = readFileSync(migration0009Path, 'utf8');
  const patched0009 = raw0009.replace(/comment on column[\s\S]*?;/g, '');
  mem.public.none(patched0009);

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
