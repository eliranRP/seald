# Contacts CRUD + Postgres + Kysely — Design

**Status:** Draft — awaiting user review
**Date:** 2026-04-23
**Scope:** Sub-project 2 of 2. Adds a Postgres connection (direct to the live Supabase `seald` project), a Kysely typed query layer, the first business resource (`contacts`) with full CRUD behind the existing `AuthGuard`, and a repository-pattern abstraction hiding the DB choice. Builds on Sub-project 1 (monorepo + Supabase JWT validation — see `2026-04-23-backend-monorepo-auth-design.md`).

---

## 1. Goal

Ship the first persistent resource end-to-end:

1. The API can talk to the live Supabase Postgres database of the `seald` project via Kysely.
2. A `contacts` table exists, scoped to `auth.users.id`.
3. Authenticated users can create / list / get / update / delete **their own** contacts through REST endpoints.
4. Everything behind a `ContactsRepository` port so swapping Postgres (or adding a cache / alternate store) later is a one-file change.

## 2. Non-goals

- Frontend swap. `apps/web/src/lib/mockApi/data/contacts.ts` stays. A separate future spec replaces the mock.
- Row-Level Security policies — the backend is the sole gate and connects as the admin role which bypasses RLS anyway. RLS is left enabled with no policies (default-deny) as defence-in-depth against any future direct-client access.
- Other resources (documents, signers, emails).
- Pagination, full-text search, sorting controls. Default sort `created_at desc`, return all rows for an owner. Revisit when we hit an actual volume problem.
- Bulk operations, import/export.
- Sharing contacts across users, multi-tenant / workspace scoping.
- Soft-delete / archival.
- Analytics, audit log.

## 3. Architecture overview

```
HTTP request ─▶ AuthGuard (Phase 1) ─▶ ContactsController
                                            │
                                            ▼
                                     ContactsService          ← error mapping only
                                            │
                                            ▼
                             ContactsRepository (abstract)    ← port (the DI token)
                                            │
                                            ▼
                          ContactsPgRepository (Kysely + pg)  ← adapter
                                            │
                                            ▼
                          Supabase Postgres (direct, SSL)
```

Key rule: the controller never trusts client-supplied `owner_id`. It always reads `@CurrentUser().id` from the verified JWT.

## 4. Repo layout additions

```
apps/api/
├─ db/
│  ├─ migrations/
│  │  └─ 0001_contacts.sql           ← authored SQL, applied to Supabase via MCP
│  └─ schema.ts                      ← Kysely Database interface (source of truth for row types)
├─ src/
│  ├─ db/
│  │  ├─ db.module.ts                ← @Global(); provides DB_TOKEN
│  │  ├─ db.provider.ts              ← factory: pg.Pool + new Kysely(...) from APP_ENV
│  │  └─ db.types.ts                 ← re-exports Database and table names
│  └─ contacts/
│     ├─ contacts.module.ts
│     ├─ contacts.controller.ts      ← REST endpoints, @UseGuards(AuthGuard)
│     ├─ contacts.service.ts         ← orchestration; maps domain errors to HTTP
│     ├─ contacts.repository.ts      ← abstract class (the port / DI token)
│     ├─ contacts.repository.pg.ts   ← Kysely implementation (the adapter)
│     ├─ contact.entity.ts           ← pure domain type returned to HTTP layer
│     └─ dto/
│        ├─ create-contact.dto.ts    ← class-validator
│        └─ update-contact.dto.ts
└─ test/
   └─ contacts.e2e-spec.ts
```

No new packages in `packages/shared` this phase — all types stay in `apps/api` until the frontend swap spec introduces a shared contract.

## 5. Database

### 5.1 Connection

Supabase exposes three endpoints for a project. For a long-running Nest container on a standard host we use the **direct** connection (`db.<ref>.supabase.co:5432`). The session/transaction poolers are reserved for serverless / IPv4-only deployments.

Env additions (`apps/api/.env.example`, zod schema):

```
DATABASE_URL=postgres://postgres:<password>@db.hsjlihhcwvjvybpszjsa.supabase.co:5432/postgres?sslmode=require
```

- `DATABASE_URL` is required (no default).
- Validated by the same `parseEnv` used for Phase 1 env vars; misconfiguration fails boot with a clear message.

### 5.2 Pool + Kysely

```ts
// db.provider.ts
import { Pool } from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import type { Database } from '../../db/schema';

export const DB_TOKEN = Symbol('DB');

export const createDbProvider = () => ({
  provide: DB_TOKEN,
  inject: [APP_ENV],
  useFactory: (env: AppEnv) => {
    const pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      ssl: { rejectUnauthorized: false }, // Supabase managed CA
    });
    return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  },
});
```

`DbModule` is `@Global()` and implements `OnApplicationShutdown` → `db.destroy()` (which closes the pool).

### 5.3 Schema (migration `0001_contacts.sql`)

```sql
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
-- No policies on purpose: the backend connects as the admin role (RLS bypassed).
-- Default-deny protects against any accidental direct-client access in future.

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger contacts_set_updated_at before update on public.contacts
  for each row execute function set_updated_at();
```

### 5.4 Migration workflow

- SQL files live under `apps/api/db/migrations/` and are the source of truth.
- Applied to the live `seald` project via Supabase MCP: `apply_migration({ project_id: 'hsjlihhcwvjvybpszjsa', name: '0001_contacts', query: <file contents> })`.
- Roll-forward only. Mistakes are fixed by authoring a new numbered migration.
- `list_migrations` is used to verify the live state matches the repo before deploy.

### 5.5 Kysely schema (`apps/api/db/schema.ts`)

```ts
import type { ColumnType, Generated } from 'kysely';

export interface Database {
  contacts: ContactsTable;
}

export interface ContactsTable {
  id:         Generated<string>;
  owner_id:   string;
  name:       string;
  email:      string;
  color:      string;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string | undefined>;
}
```

## 6. Repository pattern

### 6.1 Port (abstract class = DI token)

```ts
// contacts.repository.ts
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

export abstract class ContactsRepository {
  abstract create(input: CreateContactInput): Promise<Contact>;
  abstract findAllByOwner(owner_id: string): Promise<ReadonlyArray<Contact>>;
  abstract findOneByOwner(owner_id: string, id: string): Promise<Contact | null>;
  abstract update(owner_id: string, id: string, patch: UpdateContactPatch): Promise<Contact | null>;
  abstract delete(owner_id: string, id: string): Promise<boolean>;
}

export class ContactEmailTakenError extends Error {
  constructor() { super('contact_email_taken'); this.name = 'ContactEmailTakenError'; }
}
```

Every repository method takes `owner_id` as an explicit parameter. The repository has no knowledge of the current user — it simply applies the filter it is told. This keeps the scoping rule visible at every call site and makes the port testable without an auth context.

### 6.2 Domain entity

```ts
// contact.entity.ts
export interface Contact {
  readonly id: string;
  readonly owner_id: string;
  readonly name: string;
  readonly email: string;
  readonly color: string;
  readonly created_at: string;   // ISO string; converted from Date at the adapter boundary
  readonly updated_at: string;
}
```

### 6.3 Adapter (`contacts.repository.pg.ts`)

- Injected with the Kysely instance via `DB_TOKEN`.
- `extends ContactsRepository` — DI `useClass: ContactsPgRepository` binds it to the port.
- Catches Postgres error code `23505` on `contacts_owner_email_uniq` and re-throws `ContactEmailTakenError`. All other DB errors propagate.
- Converts `Date` → ISO string at the boundary inside a `toDomain(row)` helper.
- `update` with an empty patch short-circuits to `findOneByOwner` (no-op SQL is avoided).

### 6.4 Service (`contacts.service.ts`)

- Takes `owner_id` from the controller; passes through to the repo.
- Maps domain errors to HTTP exceptions:
  - `ContactEmailTakenError` → `ConflictException('email_taken')`.
  - Missing row on get/update/delete → `NotFoundException('contact_not_found')`.
- Thin by design. No caching, no transaction spanning (one statement per request).

### 6.5 Module wiring

```ts
@Module({
  imports: [DbModule, AuthModule],
  controllers: [ContactsController],
  providers: [
    ContactsService,
    { provide: ContactsRepository, useClass: ContactsPgRepository },
  ],
})
export class ContactsModule {}
```

Tests override with `.overrideProvider(ContactsRepository).useValue(fakeRepo)`.

## 7. HTTP layer

### 7.1 Routes (all protected by `AuthGuard`)

| Verb   | Path             | Body                | Success             | Error codes |
|--------|------------------|---------------------|---------------------|-------------|
| GET    | `/contacts`      | —                   | `200 Contact[]`     | 401 |
| POST   | `/contacts`      | `CreateContactDto`  | `201 Contact`       | 400, 401, 409 `email_taken` |
| GET    | `/contacts/:id`  | —                   | `200 Contact`       | 400 (bad uuid), 401, 404 `contact_not_found` |
| PATCH  | `/contacts/:id`  | `UpdateContactDto`  | `200 Contact`       | 400, 401, 404, 409 |
| DELETE | `/contacts/:id`  | —                   | `204 No Content`    | 400, 401, 404 |

`:id` is validated by `ParseUUIDPipe` — non-UUID → 400 through the existing `HttpExceptionFilter`.

### 7.2 DTOs

```ts
// create-contact.dto.ts
export class CreateContactDto {
  @IsString() @MinLength(1) @MaxLength(200)
  readonly name!: string;

  @IsEmail() @MaxLength(320)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  readonly email!: string;

  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'color must be a 6-digit hex like #RRGGBB' })
  readonly color!: string;
}

// update-contact.dto.ts — all fields optional, same rules
export class UpdateContactDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) readonly name?: string;
  @IsOptional() @IsEmail()  @MaxLength(320)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  readonly email?: string;
  @IsOptional() @Matches(/^#[0-9A-Fa-f]{6}$/) readonly color?: string;
}
```

The global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` set up in Phase 1 is reused.

### 7.3 Response shape

All errors funnel through the existing `HttpExceptionFilter` into `{"error": "<string>"}`. New codes introduced this phase:

| HTTP | Body                                     | When |
|------|------------------------------------------|------|
| 400  | `{"error":"<validation messages>"}`      | DTO or UUID validation fails |
| 404  | `{"error":"contact_not_found"}`          | Id absent or not owned by caller |
| 409  | `{"error":"email_taken"}`                | Unique-index violation on (owner_id, email) |

### 7.4 Trust boundary

- `owner_id` is always taken from `@CurrentUser().id`, never from the request body or URL.
- `ValidationPipe` whitelist rejects unknown fields with 400 — no way to smuggle `owner_id`, `id`, `created_at`, `updated_at` through the body.
- A dedicated e2e test proves this: user A creates a contact, user B hits `GET /contacts/:idA` → 404. We return 404 (not 403) so callers can't probe existence.

## 8. Testing strategy

Three layers, each with a single responsibility:

| Layer | File | What it proves | Tooling |
|-------|------|----------------|---------|
| Repository unit | `contacts.repository.pg.spec.ts` | SQL is correct; unique-violation mapping; empty-patch short-circuit; `owner_id` appears in every WHERE. | `pg-mem` seeded with the real migration SQL on a `beforeAll`. |
| Service unit | `contacts.service.spec.ts` | Error mapping (`ContactEmailTakenError` → 409, null → 404). | Jest + hand-rolled fake repo implementing the port. |
| Controller e2e | `contacts.e2e-spec.ts` | Validation, guard, service, repo wiring, response shape, auth contract (401s), owner isolation. | `Test.createTestingModule` + `.overrideProvider(ContactsRepository).useValue(inMemoryRepo)` + reuse of Phase 1's `test/test-jwks.ts`. |

We deliberately do **not** spin up real Postgres in CI. The repository suite covers SQL via `pg-mem`; the controller suite covers wiring via an in-memory repo. Real Postgres is exercised by the manual smoke step in DoD item 3.

### 8.1 Must-have test cases

Repository:
- `create` inserts and returns a Contact with generated `id`, timestamps.
- `create` with duplicate `(owner_id, email)` throws `ContactEmailTakenError`.
- `findAllByOwner` returns only rows for that owner, ordered `created_at desc`.
- `findOneByOwner` mismatched `owner_id` → `null` (not another owner's row).
- `update` with empty patch returns current row; with values updates `updated_at`.
- `update` with mismatched `owner_id` → `null`.
- `delete` mismatched `owner_id` → `false`; matching → `true`, row gone.

Service:
- `get` / `update` / `remove` on missing row → `NotFoundException('contact_not_found')`.
- `create` / `update` bubbling `ContactEmailTakenError` → `ConflictException('email_taken')`.

Controller e2e:
- Every route without a token → 401 `missing_token`.
- Every route with an expired token → 401 `token_expired`.
- `POST /contacts` with valid body → 201 + Contact.
- `POST /contacts` with unknown field (`owner_id` in body) → 400.
- `POST /contacts` duplicate email → 409 `email_taken`.
- `GET /contacts/:id` owned by another user → 404 (not 403).
- `PATCH /contacts/:id` with empty body → 200 (no-op returns row).
- `DELETE /contacts/:id` → 204, then `GET` → 404.

## 9. Definition of Done

1. `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test`, `pnpm --filter api test:e2e`, `pnpm --filter web build` all green.
2. Migration `0001_contacts.sql` applied to the live Supabase `seald` project via MCP. Verified via `list_tables` and `list_migrations`.
3. Manual smoke pass from an authenticated browser session (reusing `/debug/auth`, optionally extending it to `/debug/contacts`): create → list → get → update → delete round-trip against real API + real DB. Recorded as a short checklist in the PR description.
4. `apps/api/README.md` updated with: DB setup, connection string format, migration workflow, how to run the three test suites.
5. Every commit passes `pnpm -r typecheck && pnpm -r lint && pnpm -r test` standalone and follows Conventional Commits.
6. No secrets in git. `apps/api/.env` stays gitignored; only the placeholder lands in `.env.example`.
7. No changes to `apps/web` source (optional `/debug/contacts` debug page is acceptable and gated behind the same Phase 1 sign-in flow).

## 10. Risks + mitigations

| Risk | Mitigation |
|------|-----------|
| Supabase rotates DB password or adds IP allow-listing. | `DATABASE_URL` is env-sourced; boot fails loudly. `/health` is public so an uptime probe catches connection loss. |
| `pg-mem` drifts from real Postgres on `citext` / `gen_random_uuid` / `citext` unique-index. | Repository suite primes `pg-mem` with the exact migration SQL. Shim any missing features at suite setup with documented workarounds. Real-DB verification happens at DoD step 3. |
| Race on duplicate email inserts. | DB unique index is the source of truth; app catches `23505` and maps to 409. No check-then-insert in application code. |
| Pool exhaustion under burst load. | `max: 10` fits the current single-container deployment. Revisit when scaling horizontally or going serverless (would switch to the transaction pooler at :6543). |
| Client sneaks `owner_id` in a body. | `forbidNonWhitelisted: true` rejects unknown fields; controller never reads `owner_id` from input. Explicit e2e covers this. |
| `auth.users` delete cascades contacts. | Intentional — GDPR-aligned behaviour when a Supabase user is deleted. Documented in migration comment. |
| New DB layer slows API boot or adds silent failure modes. | Pool is eager-initialised at module bootstrap; fail-fast on connection error. `DbModule.OnApplicationShutdown` closes the pool cleanly. |

## 11. Open questions

None at design freeze. Any future changes (pagination, search, sharing, RLS policies, frontend swap) are explicitly out of scope and tracked as separate specs.
