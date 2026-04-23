# Seald API

NestJS backend for the Seald app. Ships provider-agnostic Supabase JWT validation.

## Setup

```bash
cp .env.example .env
# Fill SUPABASE_URL with your project URL; everything else has safe defaults.
pnpm install
pnpm --filter api start:dev
```

The server listens on `PORT` (default `3000`).

## Endpoints

| Method | Path    | Auth | Response                  |
| ------ | ------- | ---- | ------------------------- |
| GET    | /health | no   | `{ status: "ok" }`        |
| GET    | /me     | yes  | `{ id, email, provider }` |

## Auth contract

All protected routes require `Authorization: Bearer <supabase-jwt>`. The token is verified against Supabase's JWKS endpoint. The provider claim is informational only — any Supabase-issued JWT is accepted regardless of OAuth provider.

| Condition                                                                    | Response                         |
| ---------------------------------------------------------------------------- | -------------------------------- |
| Missing `Authorization`                                                      | `401 { error: "missing_token" }` |
| Malformed bearer / bad signature / wrong `iss` / wrong `aud` / missing `sub` | `401 { error: "invalid_token" }` |
| Expired                                                                      | `401 { error: "token_expired" }` |

## Testing

```bash
pnpm --filter api test        # unit
pnpm --filter api test:e2e    # e2e (full Nest app)
```

Tests use a locally generated JWKS via `test/test-jwks.ts`; no network is used.

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

| Table      | Owner scoping                                       | Notes                                                                                                                           |
| ---------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `contacts` | `owner_id → auth.users.id` (cascade on user delete) | RLS enabled, no policies. Backend is the sole gate (connects as the admin role which bypasses RLS). Unique `(owner_id, email)`. |

## Contacts API

All routes require a valid Supabase JWT and are scoped by `owner_id = user.id`.

| Verb   | Path            | Success         | Notable errors                          |
| ------ | --------------- | --------------- | --------------------------------------- |
| GET    | `/contacts`     | 200 `Contact[]` | 401                                     |
| POST   | `/contacts`     | 201 `Contact`   | 400, 409 `email_taken`                  |
| GET    | `/contacts/:id` | 200 `Contact`   | 400 (bad uuid), 404 `contact_not_found` |
| PATCH  | `/contacts/:id` | 200 `Contact`   | 400, 404, 409 `email_taken`             |
| DELETE | `/contacts/:id` | 204             | 400, 404                                |

Error bodies are always `{ "error": "<string>" }`.

## Running tests

| Suite                    | Command                                                              | Where                                                  |
| ------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------ |
| All unit                 | `pnpm --filter api test`                                             | repo unit suites (env, db.module, repo, service, DTOs) |
| Repository only (pg-mem) | `pnpm --filter api test -- --testPathPattern contacts.repository.pg` | in-memory Postgres                                     |
| Service only             | `pnpm --filter api test -- --testPathPattern contacts.service`       | fake repo                                              |
| E2E                      | `pnpm --filter api test:e2e`                                         | in-memory repo, real Nest HTTP pipeline                |
