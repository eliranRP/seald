# Contacts CRUD + Postgres + Kysely Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect `apps/api` to the live Supabase Postgres (direct connection, Kysely query builder), ship a per-user `contacts` CRUD behind the existing `AuthGuard`, and introduce the repository pattern so the DB choice is one-file swappable.

**Architecture:** Nest `DbModule` (global) owns a `pg.Pool` + Kysely instance exposed via `DB_TOKEN`. `ContactsRepository` is an abstract class (doubling as DI token); `ContactsPgRepository` is the Kysely adapter. `ContactsService` maps domain errors (`ContactEmailTakenError`, null-on-missing) to HTTP exceptions. `ContactsController` exposes 5 REST routes (`GET`/`POST`/`GET/:id`/`PATCH/:id`/`DELETE/:id`) all behind `AuthGuard`, with `owner_id` always derived from `@CurrentUser().id` — never trusted from the request.

**Tech Stack:** TypeScript, NestJS 10, Kysely 0.27, `pg` 8, `pg-mem` 2 (unit tests), `class-validator` (DTOs), Jest + supertest (e2e). Supabase Postgres accessed via direct connection (`db.<ref>.supabase.co:5432`, SSL).

**Source spec:** [docs/superpowers/specs/2026-04-23-contacts-crud-design.md](../specs/2026-04-23-contacts-crud-design.md).

**Builds on:** [docs/superpowers/plans/2026-04-23-backend-monorepo-auth.md](2026-04-23-backend-monorepo-auth.md) (Phase 1 — monorepo + `AuthGuard` + `@CurrentUser()` + `HttpExceptionFilter`).

---

## File Map

**New files (`apps/api/`):**

- `apps/api/db/schema.ts` — Kysely `Database` interface + `ContactsTable` row type.
- `apps/api/db/migrations/0001_contacts.sql` — authored SQL (real Postgres targets).
- `apps/api/src/db/db.provider.ts` — `DB_TOKEN` symbol + factory producing `Kysely<Database>` from `APP_ENV`.
- `apps/api/src/db/db.module.ts` — `@Global()` module, `OnApplicationShutdown` closes the pool.
- `apps/api/src/db/db.module.spec.ts` — unit test covering factory wiring + shutdown.
- `apps/api/src/contacts/contact.entity.ts` — immutable `Contact` domain type.
- `apps/api/src/contacts/contacts.repository.ts` — abstract `ContactsRepository` + `ContactEmailTakenError`.
- `apps/api/src/contacts/contacts.repository.pg.ts` — Kysely adapter.
- `apps/api/src/contacts/contacts.repository.pg.spec.ts` — repo unit tests (pg-mem).
- `apps/api/src/contacts/contacts.service.ts` — error-mapping orchestration layer.
- `apps/api/src/contacts/contacts.service.spec.ts` — service unit tests (fake repo).
- `apps/api/src/contacts/contacts.controller.ts` — 5 REST routes.
- `apps/api/src/contacts/contacts.module.ts` — wires service, controller, repo binding.
- `apps/api/src/contacts/dto/create-contact.dto.ts` — class-validator DTO.
- `apps/api/src/contacts/dto/update-contact.dto.ts` — class-validator DTO.
- `apps/api/src/contacts/dto/contact-dto.spec.ts` — normalization test (email trim+lowercase).
- `apps/api/test/pg-mem-db.ts` — test helper: boot pg-mem, apply migration SQL, return `Kysely<Database>`.
- `apps/api/test/in-memory-contacts-repository.ts` — fake repo used by e2e.
- `apps/api/test/contacts.e2e-spec.ts` — full controller e2e.

**Modified files:**

- `apps/api/src/config/env.schema.ts` — add `DATABASE_URL` (required, `postgres://` URL).
- `apps/api/src/config/env.schema.spec.ts` — add DATABASE_URL required-and-parsed tests.
- `apps/api/.env.example` — add `DATABASE_URL=` placeholder line.
- `apps/api/.env` (local only, gitignored) — add the real connection string. Not committed.
- `apps/api/src/app.module.ts` — import `DbModule`, `ContactsModule`.
- `apps/api/package.json` — add `pg`, `kysely` runtime deps; `@types/pg`, `pg-mem` dev deps.
- `apps/api/README.md` — document DB setup, migration workflow, test matrix.

---

## Task 1: Env schema + deps + Kysely Database interface

**Files:**
- Modify: `apps/api/package.json` (deps)
- Modify: `apps/api/src/config/env.schema.ts`
- Modify: `apps/api/src/config/env.schema.spec.ts`
- Modify: `apps/api/.env.example`
- Create: `apps/api/db/schema.ts`

- [ ] **Step 1: Install runtime + dev deps**

```bash
pnpm --filter api add pg kysely
pnpm --filter api add -D @types/pg pg-mem
```

Expected: `apps/api/package.json` updated with `pg`, `kysely` under `dependencies` and `@types/pg`, `pg-mem` under `devDependencies`. `pnpm-lock.yaml` regenerated. No new root-level deps.

- [ ] **Step 2: Add failing test for `DATABASE_URL` validation**

Open `apps/api/src/config/env.schema.spec.ts` and append (do not replace existing tests — add these):

```ts
describe('env.schema — DATABASE_URL', () => {
  const base = {
    NODE_ENV: 'test',
    PORT: '3000',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_JWT_AUDIENCE: 'authenticated',
    CORS_ORIGIN: 'http://localhost:5173',
  };

  it('rejects missing DATABASE_URL', () => {
    expect(() => parseEnv(base)).toThrow(/DATABASE_URL/);
  });

  it('rejects DATABASE_URL that is not a postgres URL', () => {
    expect(() => parseEnv({ ...base, DATABASE_URL: 'http://not-postgres' })).toThrow(/DATABASE_URL/);
  });

  it('accepts a postgres:// URL', () => {
    const env = parseEnv({ ...base, DATABASE_URL: 'postgres://u:p@host:5432/db?sslmode=require' });
    expect(env.DATABASE_URL).toBe('postgres://u:p@host:5432/db?sslmode=require');
  });

  it('accepts a postgresql:// URL', () => {
    const env = parseEnv({ ...base, DATABASE_URL: 'postgresql://u:p@host:5432/db' });
    expect(env.DATABASE_URL).toBe('postgresql://u:p@host:5432/db');
  });
});
```

- [ ] **Step 3: Run and verify tests fail**

Run: `pnpm --filter api test -- --testPathPattern env.schema`
Expected: the four new tests fail (existing suite still passes). Top failure: `parseEnv` returns an object without `DATABASE_URL` because the schema doesn't know about it yet.

- [ ] **Step 4: Extend env schema**

Replace `apps/api/src/config/env.schema.ts` with:

```ts
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  SUPABASE_URL: z.string().url(),
  SUPABASE_JWT_AUDIENCE: z.string().min(1).default('authenticated'),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((v) => /^postgres(ql)?:\/\//.test(v), {
      message: 'DATABASE_URL must be a postgres:// or postgresql:// URL',
    }),
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(raw: NodeJS.ProcessEnv | Record<string, string | undefined>): AppEnv {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  return result.data;
}
```

- [ ] **Step 5: Run tests and verify they pass**

Run: `pnpm --filter api test -- --testPathPattern env.schema`
Expected: all env.schema tests (old + 4 new) pass.

- [ ] **Step 6: Update .env.example**

Append to `apps/api/.env.example`:

```
# Full Postgres connection string for the Supabase project.
# Copy from Supabase Dashboard → Project Settings → Database → Connection string (URI).
# Include ?sslmode=require (Supabase mandates SSL).
DATABASE_URL=postgres://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require
```

- [ ] **Step 7: Create Kysely Database interface**

Create `apps/api/db/schema.ts`:

```ts
import type { ColumnType, Generated } from 'kysely';

export interface Database {
  contacts: ContactsTable;
}

export interface ContactsTable {
  id: Generated<string>;
  owner_id: string;
  name: string;
  email: string;
  color: string;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string | undefined>;
}
```

- [ ] **Step 8: Typecheck + commit**

Run: `pnpm --filter api typecheck && pnpm --filter api lint`
Expected: both clean.

```bash
git add apps/api/package.json apps/api/src/config/env.schema.ts apps/api/src/config/env.schema.spec.ts apps/api/.env.example apps/api/db/schema.ts pnpm-lock.yaml
git commit -m "feat(api): require DATABASE_URL in env + add Kysely schema"
```

---

## Task 2: DbModule + DB_TOKEN provider

**Files:**
- Create: `apps/api/src/db/db.provider.ts`
- Create: `apps/api/src/db/db.module.ts`
- Create: `apps/api/src/db/db.module.spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write failing unit test for db.provider**

Create `apps/api/src/db/db.module.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { Kysely } from 'kysely';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import { DbModule } from './db.module';
import { DB_TOKEN } from './db.provider';

const TEST_ENV: AppEnv = {
  NODE_ENV: 'test',
  PORT: 3000,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_JWT_AUDIENCE: 'authenticated',
  CORS_ORIGIN: 'http://localhost:5173',
  DATABASE_URL: 'postgres://u:p@127.0.0.1:5432/db?sslmode=disable',
};

describe('DbModule', () => {
  it('provides a Kysely instance via DB_TOKEN', async () => {
    const mod = await Test.createTestingModule({ imports: [DbModule] })
      .overrideProvider(APP_ENV)
      .useValue(TEST_ENV)
      .compile();

    const db = mod.get(DB_TOKEN);
    expect(db).toBeInstanceOf(Kysely);

    // Close without executing queries — pool is lazy, destroy is safe pre-query.
    await mod.close();
  });

  it('closes the pool on shutdown', async () => {
    const mod = await Test.createTestingModule({ imports: [DbModule] })
      .overrideProvider(APP_ENV)
      .useValue(TEST_ENV)
      .compile();

    const db = mod.get(DB_TOKEN) as Kysely<unknown>;
    const destroy = jest.spyOn(db, 'destroy');

    await mod.close();
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run and verify test fails**

Run: `pnpm --filter api test -- --testPathPattern db.module`
Expected: fails with "Cannot find module './db.module'" or similar.

- [ ] **Step 3: Implement db.provider.ts**

Create `apps/api/src/db/db.provider.ts`:

```ts
import { Pool } from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import type { FactoryProvider } from '@nestjs/common';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import type { Database } from '../../db/schema';

export const DB_TOKEN = Symbol('DB');

export function createDbProvider(): FactoryProvider<Kysely<Database>> {
  return {
    provide: DB_TOKEN,
    inject: [APP_ENV],
    useFactory: (env: AppEnv) => {
      const pool = new Pool({
        connectionString: env.DATABASE_URL,
        max: 10,
        idleTimeoutMillis: 30_000,
        // Supabase uses a managed CA; do not require CA verification locally.
        // In production the host may inject NODE_EXTRA_CA_CERTS to tighten this.
        ssl: env.DATABASE_URL.includes('sslmode=disable')
          ? false
          : { rejectUnauthorized: false },
      });
      return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
    },
  };
}
```

- [ ] **Step 4: Implement db.module.ts**

Create `apps/api/src/db/db.module.ts`:

```ts
import { Global, Module, type OnApplicationShutdown, Inject } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { Database } from '../../db/schema';
import { createDbProvider, DB_TOKEN } from './db.provider';

@Global()
@Module({
  providers: [createDbProvider()],
  exports: [DB_TOKEN],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(DB_TOKEN) private readonly db: Kysely<Database>) {}

  async onApplicationShutdown(): Promise<void> {
    await this.db.destroy();
  }
}
```

- [ ] **Step 5: Run tests and verify they pass**

Run: `pnpm --filter api test -- --testPathPattern db.module`
Expected: both tests pass.

- [ ] **Step 6: Wire into AppModule**

Replace `apps/api/src/app.module.ts` with:

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { DbModule } from './db/db.module';
import { HealthModule } from './health/health.module';

@Module({ imports: [ConfigModule, DbModule, AuthModule, HealthModule] })
export class AppModule {}
```

- [ ] **Step 7: Full suite + commit**

Run: `pnpm --filter api typecheck && pnpm --filter api lint && pnpm --filter api test`
Expected: all green.

```bash
git add apps/api/src/db apps/api/src/app.module.ts
git commit -m "feat(api): add DbModule with Kysely + pg pool provider"
```

---

## Task 3: Migration SQL + pg-mem test helper

**Files:**
- Create: `apps/api/db/migrations/0001_contacts.sql`
- Create: `apps/api/test/pg-mem-db.ts`
- Create: `apps/api/test/pg-mem-db.spec.ts`

- [ ] **Step 1: Author the migration SQL**

Create `apps/api/db/migrations/0001_contacts.sql`:

```sql
-- 0001_contacts.sql
-- Creates the per-user contacts table. Scoped by owner_id -> auth.users(id).
-- Cascades on user deletion (GDPR-aligned: a user's contacts die with them).
-- RLS is enabled with no policies: the backend connects as the admin role
-- (bypasses RLS) and is the sole gate. Default-deny protects against
-- any accidental direct-client access in future.

create extension if not exists "citext";

create table public.contacts (
  id          uuid        primary key default gen_random_uuid(),
  owner_id    uuid        not null references auth.users(id) on delete cascade,
  name        text        not null check (char_length(name)  between 1 and 200),
  email       citext      not null check (char_length(email) between 3 and 320),
  color       text        not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index contacts_owner_email_uniq on public.contacts (owner_id, email);
create        index contacts_owner_idx        on public.contacts (owner_id);

alter table public.contacts enable row level security;

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();
```

- [ ] **Step 2: Author the pg-mem helper**

Create `apps/api/test/pg-mem-db.ts`:

```ts
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
    // Strip the trigger + function definition — pg-mem has partial plpgsql support
    // and we don't assert on trigger-driven updated_at in unit tests.
    .replace(/create or replace function public\.set_updated_at\(\)[\s\S]*?\$\$;/g, '')
    .replace(/create trigger contacts_set_updated_at[\s\S]*?execute function public\.set_updated_at\(\);/g, '');

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
```

- [ ] **Step 3: Write a smoke test that the helper actually boots**

Create `apps/api/test/pg-mem-db.spec.ts`:

```ts
import { createPgMemDb, seedUser } from './pg-mem-db';

describe('pg-mem-db helper', () => {
  it('applies the migration and supports insert + select on contacts', async () => {
    const handle = createPgMemDb();
    try {
      const ownerId = await seedUser(handle);

      const inserted = await handle.db
        .insertInto('contacts')
        .values({
          owner_id: ownerId,
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          color: '#FF00FF',
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      expect(inserted.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(inserted.owner_id).toBe(ownerId);

      const rows = await handle.db
        .selectFrom('contacts')
        .selectAll()
        .where('owner_id', '=', ownerId)
        .execute();

      expect(rows).toHaveLength(1);
      expect(rows[0]?.email).toBe('ada@example.com');
    } finally {
      await handle.close();
    }
  });
});
```

- [ ] **Step 4: Run and verify**

Run: `pnpm --filter api test -- --testPathPattern pg-mem-db`
Expected: 1 passing test. If this fails, the patched SQL is wrong — fix the substitutions in `pg-mem-db.ts` before moving on. This is the foundation for every repo test below.

- [ ] **Step 5: Commit**

```bash
git add apps/api/db/migrations/0001_contacts.sql apps/api/test/pg-mem-db.ts apps/api/test/pg-mem-db.spec.ts
git commit -m "feat(api): add contacts migration SQL + pg-mem test harness"
```

---

## Task 4: Apply migration to live Supabase

**Files:** none — this is an out-of-repo side effect on the live `seald` project.

- [ ] **Step 1: Read the migration file into a variable**

Read `apps/api/db/migrations/0001_contacts.sql` — the exact file contents committed in Task 3.

- [ ] **Step 2: Apply via Supabase MCP**

Call: `mcp__...__apply_migration` with:
- `project_id`: `hsjlihhcwvjvybpszjsa`
- `name`: `0001_contacts`
- `query`: the full SQL from step 1

Expected: successful response. If it errors with "extension citext not available", retry — Supabase includes citext but may need a moment after project creation.

- [ ] **Step 3: Verify the table exists**

Call: `mcp__...__list_tables` with `project_id: hsjlihhcwvjvybpszjsa`, `schemas: ["public"]`.
Expected: `contacts` appears with the 7 columns from the migration.

Call: `mcp__...__list_migrations` with `project_id: hsjlihhcwvjvybpszjsa`.
Expected: `0001_contacts` appears in the list.

- [ ] **Step 4: Document in PR description**

No commit here (the SQL is already committed). Record in the PR body:
> Applied migration `0001_contacts` to Supabase project `hsjlihhcwvjvybpszjsa` via MCP on $(date -u). `list_tables` confirms `public.contacts` with 7 columns; `list_migrations` confirms `0001_contacts` is recorded.

---

## Task 5: Domain entity + repository port

**Files:**
- Create: `apps/api/src/contacts/contact.entity.ts`
- Create: `apps/api/src/contacts/contacts.repository.ts`

- [ ] **Step 1: Create the domain entity**

Create `apps/api/src/contacts/contact.entity.ts`:

```ts
/**
 * Pure domain shape of a Contact as exposed by the repository and consumed
 * by the HTTP layer. Timestamps are ISO strings — adapters convert from the
 * DB-native `Date` at the boundary.
 */
export interface Contact {
  readonly id: string;
  readonly owner_id: string;
  readonly name: string;
  readonly email: string;
  readonly color: string;
  readonly created_at: string;
  readonly updated_at: string;
}
```

- [ ] **Step 2: Create the repository port + domain error**

Create `apps/api/src/contacts/contacts.repository.ts`:

```ts
import type { Contact } from './contact.entity';

export interface CreateContactInput {
  readonly owner_id: string;
  readonly name: string;
  readonly email: string;
  readonly color: string;
}

export interface UpdateContactPatch {
  readonly name?: string;
  readonly email?: string;
  readonly color?: string;
}

/**
 * Port for contact persistence. Every method takes `owner_id` as an explicit
 * argument so the scoping rule is visible at every call site. The repository
 * does not know about "the current user" — the caller enforces that.
 */
export abstract class ContactsRepository {
  abstract create(input: CreateContactInput): Promise<Contact>;
  abstract findAllByOwner(owner_id: string): Promise<ReadonlyArray<Contact>>;
  abstract findOneByOwner(owner_id: string, id: string): Promise<Contact | null>;
  abstract update(
    owner_id: string,
    id: string,
    patch: UpdateContactPatch,
  ): Promise<Contact | null>;
  abstract delete(owner_id: string, id: string): Promise<boolean>;
}

/**
 * Thrown by adapters when the (owner_id, email) unique index is violated.
 * The service layer maps this to a 409 Conflict. Adapters never throw HTTP
 * exceptions directly — the port stays transport-agnostic.
 */
export class ContactEmailTakenError extends Error {
  constructor() {
    super('contact_email_taken');
    this.name = 'ContactEmailTakenError';
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter api typecheck`
Expected: clean (no consumers yet — just the type shapes).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/contacts/contact.entity.ts apps/api/src/contacts/contacts.repository.ts
git commit -m "feat(api): add Contact entity + repository port"
```

---

## Task 6: Pg adapter — create + findAllByOwner

**Files:**
- Create: `apps/api/src/contacts/contacts.repository.pg.ts`
- Create: `apps/api/src/contacts/contacts.repository.pg.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/contacts/contacts.repository.pg.spec.ts`:

```ts
import { createPgMemDb, seedUser, type PgMemHandle } from '../../test/pg-mem-db';
import { ContactsPgRepository } from './contacts.repository.pg';

describe('ContactsPgRepository — create + list', () => {
  let handle: PgMemHandle;
  let repo: ContactsPgRepository;
  let ownerId: string;

  beforeEach(async () => {
    handle = createPgMemDb();
    repo = new ContactsPgRepository(handle.db);
    ownerId = await seedUser(handle);
  });

  afterEach(async () => {
    await handle.close();
  });

  it('create inserts a row and returns the full Contact with ISO timestamps', async () => {
    const c = await repo.create({
      owner_id: ownerId,
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      color: '#FF00FF',
    });
    expect(c.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(c.owner_id).toBe(ownerId);
    expect(c.name).toBe('Ada Lovelace');
    expect(c.email).toBe('ada@example.com');
    expect(c.color).toBe('#FF00FF');
    expect(c.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(c.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('findAllByOwner returns rows only for that owner, newest first', async () => {
    const otherOwner = await seedUser(handle);
    await repo.create({ owner_id: ownerId,     name: 'First',  email: 'first@x.com',  color: '#111111' });
    await repo.create({ owner_id: ownerId,     name: 'Second', email: 'second@x.com', color: '#222222' });
    await repo.create({ owner_id: otherOwner,  name: 'Other',  email: 'other@x.com',  color: '#333333' });

    const mine = await repo.findAllByOwner(ownerId);
    expect(mine).toHaveLength(2);
    expect(mine.map((c) => c.email)).toEqual(expect.arrayContaining(['first@x.com', 'second@x.com']));
    expect(mine.every((c) => c.owner_id === ownerId)).toBe(true);

    const theirs = await repo.findAllByOwner(otherOwner);
    expect(theirs).toHaveLength(1);
    expect(theirs[0]?.email).toBe('other@x.com');
  });

  it('findAllByOwner returns [] when the owner has no contacts', async () => {
    expect(await repo.findAllByOwner(ownerId)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter api test -- --testPathPattern contacts.repository.pg`
Expected: fails with "Cannot find module './contacts.repository.pg'".

- [ ] **Step 3: Implement the adapter (partial: create + findAllByOwner + toDomain)**

Create `apps/api/src/contacts/contacts.repository.pg.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import type { Kysely, Selectable } from 'kysely';
import type { Database, ContactsTable } from '../../db/schema';
import { DB_TOKEN } from '../db/db.provider';
import type { Contact } from './contact.entity';
import {
  ContactsRepository,
  type CreateContactInput,
  type UpdateContactPatch,
} from './contacts.repository';

type Row = Selectable<ContactsTable>;

function toDomain(r: Row): Contact {
  return {
    id: r.id,
    owner_id: r.owner_id,
    name: r.name,
    email: r.email,
    color: r.color,
    created_at: new Date(r.created_at).toISOString(),
    updated_at: new Date(r.updated_at).toISOString(),
  };
}

@Injectable()
export class ContactsPgRepository extends ContactsRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Kysely<Database>) {
    super();
  }

  async create(input: CreateContactInput): Promise<Contact> {
    const row = await this.db
      .insertInto('contacts')
      .values({
        owner_id: input.owner_id,
        name: input.name,
        email: input.email,
        color: input.color,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async findAllByOwner(owner_id: string): Promise<ReadonlyArray<Contact>> {
    const rows = await this.db
      .selectFrom('contacts')
      .selectAll()
      .where('owner_id', '=', owner_id)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toDomain);
  }

  async findOneByOwner(_owner_id: string, _id: string): Promise<Contact | null> {
    throw new Error('not implemented');
  }
  async update(_owner_id: string, _id: string, _patch: UpdateContactPatch): Promise<Contact | null> {
    throw new Error('not implemented');
  }
  async delete(_owner_id: string, _id: string): Promise<boolean> {
    throw new Error('not implemented');
  }
}
```

- [ ] **Step 4: Run tests and verify pass**

Run: `pnpm --filter api test -- --testPathPattern contacts.repository.pg`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contacts/contacts.repository.pg.ts apps/api/src/contacts/contacts.repository.pg.spec.ts
git commit -m "feat(api): add ContactsPgRepository.create + findAllByOwner"
```

---

## Task 7: Pg adapter — findOneByOwner + update + delete

**Files:**
- Modify: `apps/api/src/contacts/contacts.repository.pg.ts`
- Modify: `apps/api/src/contacts/contacts.repository.pg.spec.ts`

- [ ] **Step 1: Append failing tests**

Append to `apps/api/src/contacts/contacts.repository.pg.spec.ts`:

```ts
describe('ContactsPgRepository — findOne / update / delete', () => {
  let handle: PgMemHandle;
  let repo: ContactsPgRepository;
  let ownerId: string;
  let otherOwnerId: string;

  beforeEach(async () => {
    handle = createPgMemDb();
    repo = new ContactsPgRepository(handle.db);
    ownerId = await seedUser(handle);
    otherOwnerId = await seedUser(handle);
  });
  afterEach(async () => {
    await handle.close();
  });

  it('findOneByOwner returns the row when owned', async () => {
    const c = await repo.create({ owner_id: ownerId, name: 'A', email: 'a@x.com', color: '#000000' });
    const got = await repo.findOneByOwner(ownerId, c.id);
    expect(got?.id).toBe(c.id);
  });

  it('findOneByOwner returns null when id belongs to another owner', async () => {
    const c = await repo.create({ owner_id: ownerId, name: 'A', email: 'a@x.com', color: '#000000' });
    const got = await repo.findOneByOwner(otherOwnerId, c.id);
    expect(got).toBeNull();
  });

  it('findOneByOwner returns null for an unknown id', async () => {
    const got = await repo.findOneByOwner(ownerId, '00000000-0000-0000-0000-000000000000');
    expect(got).toBeNull();
  });

  it('update with a non-empty patch mutates the owned row and returns it', async () => {
    const c = await repo.create({ owner_id: ownerId, name: 'A', email: 'a@x.com', color: '#000000' });
    const got = await repo.update(ownerId, c.id, { name: 'A2', color: '#FFFFFF' });
    expect(got?.name).toBe('A2');
    expect(got?.color).toBe('#FFFFFF');
    expect(got?.email).toBe('a@x.com');
  });

  it('update with an empty patch returns the current row without erroring', async () => {
    const c = await repo.create({ owner_id: ownerId, name: 'A', email: 'a@x.com', color: '#000000' });
    const got = await repo.update(ownerId, c.id, {});
    expect(got?.id).toBe(c.id);
    expect(got?.name).toBe('A');
  });

  it('update returns null when owner does not match', async () => {
    const c = await repo.create({ owner_id: ownerId, name: 'A', email: 'a@x.com', color: '#000000' });
    const got = await repo.update(otherOwnerId, c.id, { name: 'hacked' });
    expect(got).toBeNull();
    const fresh = await repo.findOneByOwner(ownerId, c.id);
    expect(fresh?.name).toBe('A');
  });

  it('delete returns true and removes an owned row', async () => {
    const c = await repo.create({ owner_id: ownerId, name: 'A', email: 'a@x.com', color: '#000000' });
    expect(await repo.delete(ownerId, c.id)).toBe(true);
    expect(await repo.findOneByOwner(ownerId, c.id)).toBeNull();
  });

  it('delete returns false when owner does not match', async () => {
    const c = await repo.create({ owner_id: ownerId, name: 'A', email: 'a@x.com', color: '#000000' });
    expect(await repo.delete(otherOwnerId, c.id)).toBe(false);
    expect(await repo.findOneByOwner(ownerId, c.id)).not.toBeNull();
  });

  it('delete returns false for an unknown id', async () => {
    expect(await repo.delete(ownerId, '00000000-0000-0000-0000-000000000000')).toBe(false);
  });
});
```

- [ ] **Step 2: Run and verify failures**

Run: `pnpm --filter api test -- --testPathPattern contacts.repository.pg`
Expected: the 9 new tests fail with "not implemented".

- [ ] **Step 3: Fill in the three methods**

Replace the three placeholder methods in `apps/api/src/contacts/contacts.repository.pg.ts` with:

```ts
  async findOneByOwner(owner_id: string, id: string): Promise<Contact | null> {
    const row = await this.db
      .selectFrom('contacts')
      .selectAll()
      .where('owner_id', '=', owner_id)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async update(
    owner_id: string,
    id: string,
    patch: UpdateContactPatch,
  ): Promise<Contact | null> {
    if (Object.keys(patch).length === 0) {
      return this.findOneByOwner(owner_id, id);
    }
    const row = await this.db
      .updateTable('contacts')
      .set({ ...patch, updated_at: new Date().toISOString() })
      .where('owner_id', '=', owner_id)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async delete(owner_id: string, id: string): Promise<boolean> {
    const res = await this.db
      .deleteFrom('contacts')
      .where('owner_id', '=', owner_id)
      .where('id', '=', id)
      .executeTakeFirst();
    return (res?.numDeletedRows ?? 0n) > 0n;
  }
```

> Note: we set `updated_at` explicitly in the update query. The real DB's `set_updated_at` trigger would do this automatically, but we strip the trigger for pg-mem compatibility (see `pg-mem-db.ts`). Setting it in the query is idempotent against the trigger on the real DB (trigger overwrites with `now()` anyway) and gives us a testable value without the trigger.

- [ ] **Step 4: Run tests and verify pass**

Run: `pnpm --filter api test -- --testPathPattern contacts.repository.pg`
Expected: all 12 tests in the file pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contacts/contacts.repository.pg.ts apps/api/src/contacts/contacts.repository.pg.spec.ts
git commit -m "feat(api): add ContactsPgRepository findOne/update/delete with owner isolation"
```

---

## Task 8: Pg adapter — unique-violation → `ContactEmailTakenError`

**Files:**
- Modify: `apps/api/src/contacts/contacts.repository.pg.ts`
- Modify: `apps/api/src/contacts/contacts.repository.pg.spec.ts`

- [ ] **Step 1: Append failing tests**

Append to `apps/api/src/contacts/contacts.repository.pg.spec.ts`:

```ts
import { ContactEmailTakenError } from './contacts.repository';

describe('ContactsPgRepository — unique-violation mapping', () => {
  let handle: PgMemHandle;
  let repo: ContactsPgRepository;
  let ownerId: string;

  beforeEach(async () => {
    handle = createPgMemDb();
    repo = new ContactsPgRepository(handle.db);
    ownerId = await seedUser(handle);
  });
  afterEach(async () => {
    await handle.close();
  });

  it('create throws ContactEmailTakenError on (owner_id, email) collision', async () => {
    await repo.create({ owner_id: ownerId, name: 'A', email: 'dup@x.com', color: '#000000' });
    await expect(
      repo.create({ owner_id: ownerId, name: 'B', email: 'dup@x.com', color: '#111111' }),
    ).rejects.toBeInstanceOf(ContactEmailTakenError);
  });

  it('create succeeds for the same email under a different owner', async () => {
    const otherOwner = await seedUser(handle);
    await repo.create({ owner_id: ownerId,    name: 'A', email: 'dup@x.com', color: '#000000' });
    await expect(
      repo.create({ owner_id: otherOwner, name: 'B', email: 'dup@x.com', color: '#111111' }),
    ).resolves.toMatchObject({ email: 'dup@x.com' });
  });

  it('update throws ContactEmailTakenError when switching to an existing email', async () => {
    const a = await repo.create({ owner_id: ownerId, name: 'A', email: 'a@x.com', color: '#000000' });
    await repo.create({            owner_id: ownerId, name: 'B', email: 'b@x.com', color: '#111111' });
    await expect(repo.update(ownerId, a.id, { email: 'b@x.com' })).rejects.toBeInstanceOf(
      ContactEmailTakenError,
    );
  });
});
```

- [ ] **Step 2: Run and verify failures**

Run: `pnpm --filter api test -- --testPathPattern contacts.repository.pg`
Expected: the 3 new tests fail — likely with a generic `DatabaseError` about unique constraint, not our `ContactEmailTakenError`.

- [ ] **Step 3: Add the catch + mapper**

Edit `apps/api/src/contacts/contacts.repository.pg.ts`:

Add the import:

```ts
import { ContactEmailTakenError } from './contacts.repository';
```

Add a helper inside the file, above the class:

```ts
/**
 * Postgres error code 23505 = unique_violation. We only care about the
 * (owner_id, email) uniqueness — any other 23505 is re-thrown so we don't
 * hide bugs. pg-mem surfaces the same code; the constraint name matches
 * the real DB after the migration is applied verbatim.
 */
function isEmailUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; constraint?: string; message?: string };
  if (e.code !== '23505') return false;
  // Supabase/pg exposes `constraint`; pg-mem may only set `message`.
  if (e.constraint === 'contacts_owner_email_uniq') return true;
  if (typeof e.message === 'string' && e.message.includes('contacts_owner_email_uniq')) return true;
  return false;
}
```

Wrap `create` and `update` bodies:

```ts
  async create(input: CreateContactInput): Promise<Contact> {
    try {
      const row = await this.db
        .insertInto('contacts')
        .values({
          owner_id: input.owner_id,
          name: input.name,
          email: input.email,
          color: input.color,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return toDomain(row);
    } catch (err) {
      if (isEmailUniqueViolation(err)) throw new ContactEmailTakenError();
      throw err;
    }
  }

  async update(
    owner_id: string,
    id: string,
    patch: UpdateContactPatch,
  ): Promise<Contact | null> {
    if (Object.keys(patch).length === 0) {
      return this.findOneByOwner(owner_id, id);
    }
    try {
      const row = await this.db
        .updateTable('contacts')
        .set({ ...patch, updated_at: new Date().toISOString() })
        .where('owner_id', '=', owner_id)
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst();
      return row ? toDomain(row) : null;
    } catch (err) {
      if (isEmailUniqueViolation(err)) throw new ContactEmailTakenError();
      throw err;
    }
  }
```

- [ ] **Step 4: Run tests and verify pass**

Run: `pnpm --filter api test -- --testPathPattern contacts.repository.pg`
Expected: all 15 tests in the file pass.

> If `pg-mem` does not expose the constraint name in the way expected: inspect `err.message` via `console.error` once, then update the `isEmailUniqueViolation` matcher accordingly. The plan above covers both common pg-mem formats.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contacts/contacts.repository.pg.ts apps/api/src/contacts/contacts.repository.pg.spec.ts
git commit -m "feat(api): map 23505 unique violation to ContactEmailTakenError"
```

---

## Task 9: ContactsService + error mapping tests

**Files:**
- Create: `apps/api/src/contacts/contacts.service.ts`
- Create: `apps/api/src/contacts/contacts.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/contacts/contacts.service.spec.ts`:

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Contact } from './contact.entity';
import { ContactsService } from './contacts.service';
import {
  ContactEmailTakenError,
  ContactsRepository,
  type CreateContactInput,
  type UpdateContactPatch,
} from './contacts.repository';

class FakeRepo extends ContactsRepository {
  store = new Map<string, Contact>();
  throwEmailTakenOnCreate = false;
  throwEmailTakenOnUpdate = false;

  async create(input: CreateContactInput): Promise<Contact> {
    if (this.throwEmailTakenOnCreate) throw new ContactEmailTakenError();
    const now = new Date().toISOString();
    const c: Contact = {
      id: `c_${this.store.size + 1}`,
      owner_id: input.owner_id,
      name: input.name,
      email: input.email,
      color: input.color,
      created_at: now,
      updated_at: now,
    };
    this.store.set(c.id, c);
    return c;
  }
  async findAllByOwner(owner_id: string): Promise<ReadonlyArray<Contact>> {
    return [...this.store.values()].filter((c) => c.owner_id === owner_id);
  }
  async findOneByOwner(owner_id: string, id: string): Promise<Contact | null> {
    const c = this.store.get(id);
    return c && c.owner_id === owner_id ? c : null;
  }
  async update(owner_id: string, id: string, patch: UpdateContactPatch): Promise<Contact | null> {
    if (this.throwEmailTakenOnUpdate) throw new ContactEmailTakenError();
    const existing = await this.findOneByOwner(owner_id, id);
    if (!existing) return null;
    const next: Contact = { ...existing, ...patch, updated_at: new Date().toISOString() };
    this.store.set(id, next);
    return next;
  }
  async delete(owner_id: string, id: string): Promise<boolean> {
    const c = await this.findOneByOwner(owner_id, id);
    if (!c) return false;
    this.store.delete(id);
    return true;
  }
}

describe('ContactsService', () => {
  const OWNER = 'user-1';
  const OTHER = 'user-2';
  let repo: FakeRepo;
  let svc: ContactsService;

  beforeEach(() => {
    repo = new FakeRepo();
    svc = new ContactsService(repo);
  });

  it('create: happy path returns Contact', async () => {
    const c = await svc.create(OWNER, { name: 'A', email: 'a@x.com', color: '#000000' });
    expect(c.owner_id).toBe(OWNER);
  });

  it('create: ContactEmailTakenError → ConflictException("email_taken")', async () => {
    repo.throwEmailTakenOnCreate = true;
    await expect(
      svc.create(OWNER, { name: 'A', email: 'a@x.com', color: '#000000' }),
    ).rejects.toMatchObject({
      constructor: ConflictException,
      message: 'email_taken',
    });
  });

  it('list: passes owner_id through', async () => {
    await repo.create({ owner_id: OWNER, name: 'A', email: 'a@x.com', color: '#000000' });
    await repo.create({ owner_id: OTHER, name: 'B', email: 'b@x.com', color: '#111111' });
    const rows = await svc.list(OWNER);
    expect(rows.map((r) => r.email)).toEqual(['a@x.com']);
  });

  it('get: missing row → NotFoundException("contact_not_found")', async () => {
    await expect(svc.get(OWNER, 'missing')).rejects.toMatchObject({
      constructor: NotFoundException,
      message: 'contact_not_found',
    });
  });

  it('get: owned row returns Contact', async () => {
    const c = await repo.create({ owner_id: OWNER, name: 'A', email: 'a@x.com', color: '#000000' });
    const got = await svc.get(OWNER, c.id);
    expect(got.id).toBe(c.id);
  });

  it('update: missing row → NotFoundException', async () => {
    await expect(svc.update(OWNER, 'missing', { name: 'X' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('update: ContactEmailTakenError → ConflictException("email_taken")', async () => {
    const c = await repo.create({ owner_id: OWNER, name: 'A', email: 'a@x.com', color: '#000000' });
    repo.throwEmailTakenOnUpdate = true;
    await expect(svc.update(OWNER, c.id, { email: 'b@x.com' })).rejects.toMatchObject({
      constructor: ConflictException,
      message: 'email_taken',
    });
  });

  it('remove: missing row → NotFoundException', async () => {
    await expect(svc.remove(OWNER, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove: owned row → resolves void', async () => {
    const c = await repo.create({ owner_id: OWNER, name: 'A', email: 'a@x.com', color: '#000000' });
    await expect(svc.remove(OWNER, c.id)).resolves.toBeUndefined();
    expect(await svc.list(OWNER)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter api test -- --testPathPattern contacts.service`
Expected: fails — `contacts.service` does not exist.

- [ ] **Step 3: Implement the service**

Create `apps/api/src/contacts/contacts.service.ts`:

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Contact } from './contact.entity';
import type { CreateContactDto } from './dto/create-contact.dto';
import type { UpdateContactDto } from './dto/update-contact.dto';
import { ContactEmailTakenError, ContactsRepository } from './contacts.repository';

@Injectable()
export class ContactsService {
  constructor(private readonly repo: ContactsRepository) {}

  async create(owner_id: string, dto: CreateContactDto): Promise<Contact> {
    try {
      return await this.repo.create({ owner_id, ...dto });
    } catch (err) {
      if (err instanceof ContactEmailTakenError) throw new ConflictException('email_taken');
      throw err;
    }
  }

  list(owner_id: string): Promise<ReadonlyArray<Contact>> {
    return this.repo.findAllByOwner(owner_id);
  }

  async get(owner_id: string, id: string): Promise<Contact> {
    const c = await this.repo.findOneByOwner(owner_id, id);
    if (!c) throw new NotFoundException('contact_not_found');
    return c;
  }

  async update(owner_id: string, id: string, dto: UpdateContactDto): Promise<Contact> {
    try {
      const c = await this.repo.update(owner_id, id, dto);
      if (!c) throw new NotFoundException('contact_not_found');
      return c;
    } catch (err) {
      if (err instanceof ContactEmailTakenError) throw new ConflictException('email_taken');
      throw err;
    }
  }

  async remove(owner_id: string, id: string): Promise<void> {
    const ok = await this.repo.delete(owner_id, id);
    if (!ok) throw new NotFoundException('contact_not_found');
  }
}
```

> This imports `CreateContactDto` and `UpdateContactDto` which don't exist yet. That's intentional — Task 10 adds them. Typecheck will fail until then, which is fine for this task's commit since tests compile via ts-jest and only exercise runtime behaviour with `FakeRepo`.

Actually — wait. Jest via ts-jest respects tsconfig; strict type errors will fail compilation even of test files. Create empty placeholder DTOs now so this task is self-contained:

Create `apps/api/src/contacts/dto/create-contact.dto.ts`:

```ts
// Full implementation lands in Task 10.
export class CreateContactDto {
  name!: string;
  email!: string;
  color!: string;
}
```

Create `apps/api/src/contacts/dto/update-contact.dto.ts`:

```ts
// Full implementation lands in Task 10.
export class UpdateContactDto {
  name?: string;
  email?: string;
  color?: string;
}
```

- [ ] **Step 4: Run tests and verify pass**

Run: `pnpm --filter api typecheck && pnpm --filter api test -- --testPathPattern contacts.service`
Expected: typecheck clean; 9 service tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contacts/contacts.service.ts apps/api/src/contacts/contacts.service.spec.ts apps/api/src/contacts/dto
git commit -m "feat(api): add ContactsService with domain-error → HTTP mapping"
```

---

## Task 10: DTOs with class-validator

**Files:**
- Modify: `apps/api/src/contacts/dto/create-contact.dto.ts`
- Modify: `apps/api/src/contacts/dto/update-contact.dto.ts`
- Create: `apps/api/src/contacts/dto/contact-dto.spec.ts`

- [ ] **Step 1: Write failing DTO normalization test**

Create `apps/api/src/contacts/dto/contact-dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateContactDto } from './create-contact.dto';
import { UpdateContactDto } from './update-contact.dto';

describe('CreateContactDto', () => {
  it('trims and lowercases email on transform', () => {
    const dto = plainToInstance(CreateContactDto, {
      name: 'Ada',
      email: '  ADA@example.COM  ',
      color: '#ABCDEF',
    });
    expect(dto.email).toBe('ada@example.com');
  });

  it('rejects invalid hex color', async () => {
    const dto = plainToInstance(CreateContactDto, {
      name: 'Ada',
      email: 'ada@example.com',
      color: 'red',
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('color');
  });

  it('rejects empty name', async () => {
    const dto = plainToInstance(CreateContactDto, { name: '', email: 'a@b.c', color: '#000000' });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('name');
  });

  it('rejects non-email', async () => {
    const dto = plainToInstance(CreateContactDto, { name: 'Ada', email: 'not-an-email', color: '#000000' });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('email');
  });
});

describe('UpdateContactDto', () => {
  it('accepts an empty object', async () => {
    const dto = plainToInstance(UpdateContactDto, {});
    const errors = await validate(dto);
    expect(errors).toEqual([]);
  });

  it('validates individual fields when present', async () => {
    const dto = plainToInstance(UpdateContactDto, { email: 'nope' });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('email');
  });

  it('trims + lowercases email when present', () => {
    const dto = plainToInstance(UpdateContactDto, { email: '  FOO@BAR.IO ' });
    expect(dto.email).toBe('foo@bar.io');
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter api test -- --testPathPattern contact-dto`
Expected: most tests fail — placeholder DTOs have no validators/transformers.

- [ ] **Step 3: Replace the placeholder DTOs**

Replace `apps/api/src/contacts/dto/create-contact.dto.ts` with:

```ts
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const lowercaseTrim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CreateContactDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  readonly name!: string;

  @Transform(lowercaseTrim)
  @IsEmail()
  @MaxLength(320)
  readonly email!: string;

  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'color must be a 6-digit hex like #RRGGBB',
  })
  readonly color!: string;
}
```

Replace `apps/api/src/contacts/dto/update-contact.dto.ts` with:

```ts
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const lowercaseTrim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class UpdateContactDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  readonly name?: string;

  @IsOptional()
  @Transform(lowercaseTrim)
  @IsEmail()
  @MaxLength(320)
  readonly email?: string;

  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'color must be a 6-digit hex like #RRGGBB',
  })
  readonly color?: string;
}
```

- [ ] **Step 4: Run tests and verify pass**

Run: `pnpm --filter api test -- --testPathPattern contact-dto`
Expected: all 7 DTO tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contacts/dto
git commit -m "feat(api): add CreateContactDto + UpdateContactDto with validators"
```

---

## Task 11: ContactsController + module wiring

**Files:**
- Create: `apps/api/src/contacts/contacts.controller.ts`
- Create: `apps/api/src/contacts/contacts.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Implement the controller**

Create `apps/api/src/contacts/contacts.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import type { Contact } from './contact.entity';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

@Controller('contacts')
@UseGuards(AuthGuard)
export class ContactsController {
  constructor(private readonly svc: ContactsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<ReadonlyArray<Contact>> {
    return this.svc.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateContactDto): Promise<Contact> {
    return this.svc.create(user.id, dto);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Contact> {
    return this.svc.get(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactDto,
  ): Promise<Contact> {
    return this.svc.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.svc.remove(user.id, id);
  }
}
```

- [ ] **Step 2: Implement the module**

Create `apps/api/src/contacts/contacts.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContactsController } from './contacts.controller';
import { ContactsRepository } from './contacts.repository';
import { ContactsPgRepository } from './contacts.repository.pg';
import { ContactsService } from './contacts.service';

@Module({
  imports: [AuthModule],
  controllers: [ContactsController],
  providers: [
    ContactsService,
    { provide: ContactsRepository, useClass: ContactsPgRepository },
  ],
})
export class ContactsModule {}
```

- [ ] **Step 3: Register in AppModule**

Replace `apps/api/src/app.module.ts` with:

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { ContactsModule } from './contacts/contacts.module';
import { DbModule } from './db/db.module';
import { HealthModule } from './health/health.module';

@Module({ imports: [ConfigModule, DbModule, AuthModule, HealthModule, ContactsModule] })
export class AppModule {}
```

- [ ] **Step 4: Full suite**

Run: `pnpm --filter api typecheck && pnpm --filter api lint && pnpm --filter api test`
Expected: all existing + new tests green. No e2e yet.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contacts/contacts.controller.ts apps/api/src/contacts/contacts.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): add ContactsController + ContactsModule"
```

---

## Task 12: e2e — auth contract (401s on every route)

**Files:**
- Create: `apps/api/test/in-memory-contacts-repository.ts`
- Create: `apps/api/test/contacts.e2e-spec.ts`

- [ ] **Step 1: Implement the in-memory repo for e2e**

Create `apps/api/test/in-memory-contacts-repository.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { Contact } from '../src/contacts/contact.entity';
import {
  ContactEmailTakenError,
  ContactsRepository,
  type CreateContactInput,
  type UpdateContactPatch,
} from '../src/contacts/contacts.repository';

/**
 * In-memory repo used by controller e2e. Mirrors the real adapter's contract
 * — including the unique-violation → ContactEmailTakenError mapping — so the
 * controller is exercised against identical behaviour. Zero DB dependency
 * keeps the e2e fast and hermetic.
 */
export class InMemoryContactsRepository extends ContactsRepository {
  private readonly rows = new Map<string, Contact>();

  reset(): void {
    this.rows.clear();
  }

  async create(input: CreateContactInput): Promise<Contact> {
    const dup = [...this.rows.values()].find(
      (c) => c.owner_id === input.owner_id && c.email === input.email,
    );
    if (dup) throw new ContactEmailTakenError();
    const now = new Date().toISOString();
    const c: Contact = {
      id: randomUUID(),
      owner_id: input.owner_id,
      name: input.name,
      email: input.email,
      color: input.color,
      created_at: now,
      updated_at: now,
    };
    this.rows.set(c.id, c);
    return c;
  }

  async findAllByOwner(owner_id: string): Promise<ReadonlyArray<Contact>> {
    return [...this.rows.values()]
      .filter((c) => c.owner_id === owner_id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async findOneByOwner(owner_id: string, id: string): Promise<Contact | null> {
    const c = this.rows.get(id);
    return c && c.owner_id === owner_id ? c : null;
  }

  async update(
    owner_id: string,
    id: string,
    patch: UpdateContactPatch,
  ): Promise<Contact | null> {
    const existing = this.rows.get(id);
    if (!existing || existing.owner_id !== owner_id) return null;
    if (patch.email !== undefined && patch.email !== existing.email) {
      const dup = [...this.rows.values()].find(
        (c) => c.owner_id === owner_id && c.email === patch.email && c.id !== id,
      );
      if (dup) throw new ContactEmailTakenError();
    }
    const next: Contact = {
      ...existing,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    this.rows.set(id, next);
    return next;
  }

  async delete(owner_id: string, id: string): Promise<boolean> {
    const existing = this.rows.get(id);
    if (!existing || existing.owner_id !== owner_id) return false;
    this.rows.delete(id);
    return true;
  }
}
```

- [ ] **Step 2: Write failing auth-contract tests**

Create `apps/api/test/contacts.e2e-spec.ts`:

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { APP_ENV } from '../src/config/config.module';
import type { AppEnv } from '../src/config/env.schema';
import { JWKS_RESOLVER } from '../src/auth/jwks.provider';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ContactsRepository } from '../src/contacts/contacts.repository';
import { buildTestJwks } from './test-jwks';
import { InMemoryContactsRepository } from './in-memory-contacts-repository';

const TEST_ENV: AppEnv = {
  NODE_ENV: 'test',
  PORT: 0,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_JWT_AUDIENCE: 'authenticated',
  CORS_ORIGIN: 'http://localhost:5173',
  DATABASE_URL: 'postgres://u:p@127.0.0.1:5432/db?sslmode=disable',
};

const PROTECTED_ROUTES = [
  ['GET',    '/contacts'],
  ['POST',   '/contacts'],
  ['GET',    '/contacts/00000000-0000-0000-0000-000000000000'],
  ['PATCH',  '/contacts/00000000-0000-0000-0000-000000000000'],
  ['DELETE', '/contacts/00000000-0000-0000-0000-000000000000'],
] as const;

describe('Contacts — auth contract (e2e)', () => {
  let app: INestApplication;
  let repo: InMemoryContactsRepository;
  let tk: Awaited<ReturnType<typeof buildTestJwks>>;

  beforeAll(async () => {
    tk = await buildTestJwks('https://example.supabase.co/auth/v1');
    repo = new InMemoryContactsRepository();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENV).useValue(TEST_ENV)
      .overrideProvider(JWKS_RESOLVER).useValue(tk.resolver)
      .overrideProvider(ContactsRepository).useValue(repo)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  beforeEach(() => repo.reset());
  afterAll(async () => { await app.close(); });

  it.each(PROTECTED_ROUTES)('%s %s without Authorization → 401 missing_token', async (method, url) => {
    const res = await request(app.getHttpServer())[method.toLowerCase() as 'get']((url));
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'missing_token' });
  });

  it('GET /contacts with expired token → 401 token_expired', async () => {
    const token = await tk.sign({ sub: 'user-1', aud: 'authenticated' }, { expiresIn: '-1s' });
    const res = await request(app.getHttpServer()).get('/contacts').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'token_expired' });
  });
});
```

- [ ] **Step 3: Run and verify**

Run: `pnpm --filter api test:e2e -- --testPathPattern contacts`
Expected: all 6 protected-route cases + the expired-token case pass. If any fail because `HttpExceptionFilter`/`ValidationPipe` defaults differ from the auth e2e's setup, re-check `main.ts` for the canonical shape and mirror it.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/in-memory-contacts-repository.ts apps/api/test/contacts.e2e-spec.ts
git commit -m "test(api): e2e auth contract for /contacts"
```

---

## Task 13: e2e — CRUD round-trip, owner isolation, email_taken, unknown-field

**Files:**
- Modify: `apps/api/test/contacts.e2e-spec.ts`

- [ ] **Step 1: Add the behavioural e2e cases**

Append to `apps/api/test/contacts.e2e-spec.ts`:

```ts
describe('Contacts — CRUD (e2e)', () => {
  let app: INestApplication;
  let repo: InMemoryContactsRepository;
  let tk: Awaited<ReturnType<typeof buildTestJwks>>;

  const USER_A = '00000000-0000-0000-0000-00000000000a';
  const USER_B = '00000000-0000-0000-0000-00000000000b';
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    tk = await buildTestJwks('https://example.supabase.co/auth/v1');
    repo = new InMemoryContactsRepository();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENV).useValue(TEST_ENV)
      .overrideProvider(JWKS_RESOLVER).useValue(tk.resolver)
      .overrideProvider(ContactsRepository).useValue(repo)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    tokenA = await tk.sign({ sub: USER_A, aud: 'authenticated' });
    tokenB = await tk.sign({ sub: USER_B, aud: 'authenticated' });
  });
  beforeEach(() => repo.reset());
  afterAll(async () => { await app.close(); });

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  it('POST /contacts creates and GET /contacts lists only the caller rows', async () => {
    const res = await request(app.getHttpServer())
      .post('/contacts').set(auth(tokenA))
      .send({ name: 'Ada', email: 'ada@example.com', color: '#112233' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      owner_id: USER_A, name: 'Ada', email: 'ada@example.com', color: '#112233',
    });
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/i);

    // User A sees 1
    const list = await request(app.getHttpServer()).get('/contacts').set(auth(tokenA));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    // User B sees 0
    const listB = await request(app.getHttpServer()).get('/contacts').set(auth(tokenB));
    expect(listB.body).toHaveLength(0);
  });

  it('POST /contacts normalises email via Transform', async () => {
    const res = await request(app.getHttpServer())
      .post('/contacts').set(auth(tokenA))
      .send({ name: 'Ada', email: '  ADA@Example.COM ', color: '#ABCDEF' });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe('ada@example.com');
  });

  it('POST /contacts rejects unknown field (owner_id) with 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/contacts').set(auth(tokenA))
      .send({
        name: 'Ada',
        email: 'ada@example.com',
        color: '#112233',
        owner_id: USER_B, // attempt to spoof
      });
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
  });

  it('POST /contacts duplicate email for same owner → 409 email_taken', async () => {
    await request(app.getHttpServer()).post('/contacts').set(auth(tokenA))
      .send({ name: 'Ada', email: 'ada@example.com', color: '#112233' });
    const res = await request(app.getHttpServer()).post('/contacts').set(auth(tokenA))
      .send({ name: 'Ada2', email: 'ada@example.com', color: '#445566' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'email_taken' });
  });

  it('GET /contacts/:id owned by another user → 404 (no existence leak)', async () => {
    const created = await request(app.getHttpServer()).post('/contacts').set(auth(tokenA))
      .send({ name: 'Ada', email: 'ada@example.com', color: '#112233' });
    const res = await request(app.getHttpServer()).get(`/contacts/${created.body.id}`).set(auth(tokenB));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'contact_not_found' });
  });

  it('GET /contacts/:id with non-UUID → 400', async () => {
    const res = await request(app.getHttpServer()).get('/contacts/not-a-uuid').set(auth(tokenA));
    expect(res.status).toBe(400);
  });

  it('PATCH /contacts/:id with empty body → 200 echoes current', async () => {
    const created = await request(app.getHttpServer()).post('/contacts').set(auth(tokenA))
      .send({ name: 'Ada', email: 'ada@example.com', color: '#112233' });
    const res = await request(app.getHttpServer()).patch(`/contacts/${created.body.id}`).set(auth(tokenA)).send({});
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
  });

  it('PATCH /contacts/:id updates only provided fields', async () => {
    const created = await request(app.getHttpServer()).post('/contacts').set(auth(tokenA))
      .send({ name: 'Ada', email: 'ada@example.com', color: '#112233' });
    const res = await request(app.getHttpServer()).patch(`/contacts/${created.body.id}`).set(auth(tokenA))
      .send({ name: 'Ada L.' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Ada L.');
    expect(res.body.email).toBe('ada@example.com');
  });

  it('DELETE /contacts/:id → 204, then GET → 404', async () => {
    const created = await request(app.getHttpServer()).post('/contacts').set(auth(tokenA))
      .send({ name: 'Ada', email: 'ada@example.com', color: '#112233' });
    const del = await request(app.getHttpServer()).delete(`/contacts/${created.body.id}`).set(auth(tokenA));
    expect(del.status).toBe(204);
    const get = await request(app.getHttpServer()).get(`/contacts/${created.body.id}`).set(auth(tokenA));
    expect(get.status).toBe(404);
  });

  it("DELETE /contacts/:id owned by another user → 404, row still exists for A", async () => {
    const created = await request(app.getHttpServer()).post('/contacts').set(auth(tokenA))
      .send({ name: 'Ada', email: 'ada@example.com', color: '#112233' });
    const del = await request(app.getHttpServer()).delete(`/contacts/${created.body.id}`).set(auth(tokenB));
    expect(del.status).toBe(404);
    const get = await request(app.getHttpServer()).get(`/contacts/${created.body.id}`).set(auth(tokenA));
    expect(get.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run**

Run: `pnpm --filter api test:e2e -- --testPathPattern contacts`
Expected: all CRUD e2e cases pass (10 new cases + the 6 from Task 12).

- [ ] **Step 3: Full validation sweep**

Run at the repo root:

```bash
pnpm -r typecheck && pnpm -r lint && pnpm -r test && pnpm --filter api test:e2e && pnpm --filter web build
```

Expected: all green. This is the DoD gate for code changes.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/contacts.e2e-spec.ts
git commit -m "test(api): e2e CRUD, owner isolation, email_taken, unknown-field"
```

---

## Task 14: README + smoke checklist

**Files:**
- Modify: `apps/api/README.md`

- [ ] **Step 1: Add a DB + Contacts section**

Append to `apps/api/README.md`:

```markdown
## Database

### Connection

The API speaks directly to Postgres via `pg` + Kysely. The connection string comes from `DATABASE_URL` and is validated at boot by the same zod schema as every other env var.

```
DATABASE_URL=postgres://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require
```

- Use the **direct** connection (`:5432`) for this long-running Nest server.
- The session pooler (`aws-…pooler.supabase.com:5432`) is only needed on IPv4-only hosts.
- The transaction pooler (`:6543`) is reserved for serverless runtimes (no prepared statements).

### Migrations

SQL migrations live at `apps/api/db/migrations/`. They are the source of truth.

To apply a migration to the live project:

1. Commit the `.sql` file.
2. Use the Supabase MCP `apply_migration` tool with `project_id=hsjlihhcwvjvybpszjsa`, `name` matching the file stem, and `query` = full file contents.
3. Verify with `list_migrations` + `list_tables`.

Forward-only. Mistakes are fixed by authoring a new numbered migration.

### Tables

| Table       | Owner scoping             | Notes |
|-------------|---------------------------|-------|
| `contacts`  | `owner_id → auth.users.id` (cascade on user delete) | RLS enabled, no policies. Backend is the sole gate (connects as the admin role which bypasses RLS). Unique `(owner_id, email)`. |

## Contacts API

All routes require a valid Supabase JWT and are scoped by `owner_id = user.id`.

| Verb   | Path             | Success        | Notable errors |
|--------|------------------|----------------|----------------|
| GET    | `/contacts`      | 200 `Contact[]`| 401 |
| POST   | `/contacts`      | 201 `Contact`  | 400, 409 `email_taken` |
| GET    | `/contacts/:id`  | 200 `Contact`  | 400 (bad uuid), 404 `contact_not_found` |
| PATCH  | `/contacts/:id`  | 200 `Contact`  | 400, 404, 409 `email_taken` |
| DELETE | `/contacts/:id`  | 204            | 400, 404 |

Error bodies are always `{ "error": "<string>" }`.

## Running tests

| Suite                  | Command                                                                   | Where |
|------------------------|---------------------------------------------------------------------------|-------|
| All unit               | `pnpm --filter api test`                                                  | repo unit suites (env, db.module, repo, service, DTOs) |
| Repository only (pg-mem) | `pnpm --filter api test -- --testPathPattern contacts.repository.pg`     | in-memory Postgres |
| Service only           | `pnpm --filter api test -- --testPathPattern contacts.service`            | fake repo |
| E2E                    | `pnpm --filter api test:e2e`                                              | in-memory repo, real Nest HTTP pipeline |
```

- [ ] **Step 2: Manual smoke checklist (record in PR body)**

Record the following in the PR description — do not commit:

```
Manual smoke against Supabase `seald` (hsjlihhcwvjvybpszjsa) + live Google OAuth:

1. `pnpm dev:api` + `pnpm dev:web`, sign in as a Google test user at /debug/auth.
2. POST /contacts { name, email, color } → 201, returns Contact with generated uuid.
3. GET /contacts → 200, array containing the new row.
4. GET /contacts/:id → 200 with that row.
5. PATCH /contacts/:id { name: 'Updated' } → 200 with new name, same email, same updated_at bumped.
6. POST /contacts with a duplicate email → 409 {"error":"email_taken"}.
7. DELETE /contacts/:id → 204, follow-up GET → 404 {"error":"contact_not_found"}.
8. Sign in as a second Google user, GET /contacts → 200 [] (owner isolation).
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/README.md
git commit -m "docs(api): document DB setup, contacts API, test matrix"
```

---

## Definition of Done

- [ ] `pnpm -r typecheck` clean
- [ ] `pnpm -r lint` clean
- [ ] `pnpm -r test` green (all unit suites: env, db.module, repo, service, DTOs, plus Phase 1 suites)
- [ ] `pnpm --filter api test:e2e` green (Phase 1 auth e2e + Phase 2 contacts e2e)
- [ ] `pnpm --filter web build` green (no frontend changes expected; this guards against accidental regressions)
- [ ] Migration `0001_contacts` applied to Supabase `seald` via MCP; verified via `list_migrations` + `list_tables`
- [ ] Manual smoke checklist completed and recorded in the PR body
- [ ] No secrets in git; `apps/api/.env` untracked; `.env.example` carries only placeholders
- [ ] No changes to `apps/web/src` (optional `/debug/contacts` debug page is acceptable but not required)
- [ ] Every commit follows Conventional Commits and passes `pnpm -r typecheck && pnpm -r lint && pnpm -r test` standalone
