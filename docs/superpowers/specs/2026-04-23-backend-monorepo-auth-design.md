# Backend Monorepo + Supabase Auth — Design

**Status:** Draft — awaiting user review
**Date:** 2026-04-23
**Scope:** Sub-project 1 of 2. Establishes the backend app alongside the existing frontend, and adds provider-agnostic Supabase JWT validation. No database, no business resources. Sub-project 2 (Postgres + Kysely + Contacts CRUD) is a separate spec.

---

## 1. Goal

Stand up `apps/api` as a NestJS application inside a pnpm-workspace monorepo, sharing the repo with the existing Vite frontend (moved to `apps/web`). Ship a provider-agnostic Supabase JWT validator so any authenticated route can trust `request.user`. Prove the loop with a `GET /me` smoke endpoint.

## 2. Non-goals

- Database, migrations, Kysely, repository pattern — Spec 2.
- Business resources (contacts, signers, documents) — Spec 2 and later.
- Role-based authorization, workspace/org scoping.
- Refresh-token handling on the backend (Supabase client handles refresh on the frontend).
- Logout endpoint (Supabase client handles on the frontend).
- Rate limiting, structured logging beyond Nest default, observability stack.
- Any changes to existing frontend behavior beyond its file location and a "Sign in with Google" entry point needed to exercise `/me`.

## 3. Repo layout

```
seald/
├─ apps/
│  ├─ web/                 ← existing Vite app moved here intact
│  └─ api/                 ← new NestJS app
├─ packages/
│  └─ shared/              ← shared TS types; consumed by both apps
├─ package.json            ← workspace root, no app deps
├─ pnpm-workspace.yaml
└─ tsconfig.base.json
```

- Root `package.json` keeps only workspace-level scripts (`dev:web`, `dev:api`, `lint`, `test`, `typecheck`) and dev tooling used at the root (husky, lint-staged, prettier).
- Each app owns its own dependencies, `tsconfig`, lint config.
- The existing `.eslintrc.cjs` with layer rules moves into `apps/web/` unchanged.
- Storybook stays in `apps/web/`.
- `packages/shared` is a source-only TS package (no build step), consumed via `"shared": "workspace:*"`. Holds shared DTO/domain types (e.g. the existing `Signer` type moved here to prove workspace wiring).
- The existing frontend must continue to work with no behavioral change; only its path and relative imports of workspace-shared types change.

## 4. `apps/api` structure

```
apps/api/
├─ src/
│  ├─ main.ts                       ← bootstrap, ValidationPipe, CORS
│  ├─ app.module.ts                 ← imports ConfigModule, AuthModule, HealthModule
│  ├─ config/
│  │  ├─ env.schema.ts              ← zod schema for env vars
│  │  └─ config.module.ts           ← validated ConfigService
│  ├─ auth/
│  │  ├─ auth.module.ts
│  │  ├─ supabase-jwt.strategy.ts   ← Passport strategy, JWKS-backed
│  │  ├─ auth.guard.ts              ← @UseGuards for protected routes
│  │  ├─ current-user.decorator.ts  ← @CurrentUser() param
│  │  ├─ auth-user.ts               ← { id, email, provider } — pure type
│  │  └─ jwks.provider.ts           ← cached JWKS client (jose)
│  ├─ health/
│  │  ├─ health.module.ts
│  │  └─ health.controller.ts       ← GET /health (public), GET /me (protected)
│  └─ common/
│     ├─ filters/http-exception.filter.ts
│     └─ interceptors/logging.interceptor.ts
├─ test/
│  ├─ auth.e2e-spec.ts              ← valid/invalid/expired JWT
│  └─ jest-e2e.json
├─ nest-cli.json
├─ tsconfig.json
├─ tsconfig.build.json
└─ package.json                     ← @nestjs/*, passport, jose, zod, @supabase/supabase-js
```

Notes:

- `main.ts` uses `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` so DTOs auto-strip extras. (No DTOs ship in this spec; pipe is wired once.)
- `AuthGuard` is not applied globally. Routes opt in with `@UseGuards(AuthGuard)` — `/health` stays public; `/me` is protected.
- `@CurrentUser()` reads `request.user` populated by the passport strategy.
- `AuthUser` is a plain type in `auth/`. If/when the frontend needs it, it is re-exported from `packages/shared` in Spec 2.
- No DB, no repository pattern in this spec.

## 5. Supabase Auth integration (provider-agnostic)

**Per-request validation:**

1. `Authorization: Bearer <jwt>` header present.
2. Signature verified against Supabase's JWKS: `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. Keys cached in-process with TTL via `jose`'s `createRemoteJWKSet`.
3. `iss === ${SUPABASE_URL}/auth/v1`.
4. `aud === 'authenticated'`.
5. `exp` not expired (jose handles this).
6. `sub` present (used as the user id).

**Not checked:** `app_metadata.provider`. Any Supabase-issued JWT is accepted — Google today, email/Apple/etc. tomorrow with zero backend change. Provider is surfaced on `AuthUser` for informational/logging purposes only and MUST NOT be used for authorization decisions.

**`AuthUser` shape (attached to `request.user`):**

```ts
type AuthUser = {
  id: string; // JWT `sub`
  email: string | null;
  provider: string | null; // app_metadata.provider — informational only
};
```

**Env vars (validated via zod at boot; app crashes on misconfiguration):**

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_JWT_AUDIENCE=authenticated     # default, overridable
NODE_ENV=development|production|test
PORT=3000
CORS_ORIGIN=http://localhost:5173       # web dev server
```

No `SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY` in this spec — we only validate tokens, we don't call Supabase APIs. Those arrive in Spec 2 only if needed; DB access in Spec 2 uses direct Postgres, not supabase-js.

**Frontend-side (apps/web):**

- Add `@supabase/supabase-js` to `apps/web/`.
- Add a minimal `supabaseClient.ts` and a thin `fetch` wrapper that injects `Authorization: Bearer ${session.access_token}` for API calls.
- A "Sign in with Google" entry point is wired into the existing app shell sufficient to exercise `/me`. Exact placement is a UX decision outside this spec.
- No routing/page changes beyond what is needed to drive a login and hit `/me`.

**Failure modes:**

| Condition                                                                    | Response                                     |
| ---------------------------------------------------------------------------- | -------------------------------------------- |
| Missing `Authorization`                                                      | `401 { error: "missing_token" }`             |
| Malformed bearer / bad signature / wrong `iss` / wrong `aud` / missing `sub` | `401 { error: "invalid_token" }`             |
| Expired                                                                      | `401 { error: "token_expired" }`             |
| `/health` public                                                             | always `200` regardless of token             |
| `/me` protected                                                              | `200 { id, email, provider }` on valid token |

All other unexpected errors surface as `500 { error: "internal_error" }` via the `HttpExceptionFilter`.

## 6. Testing strategy

**Unit (Jest, in-process, no network):**

- `supabase-jwt.strategy.spec.ts` — build a local JWKS and sign test JWTs with `jose`; inject a mock `JwksProvider`. Verify: valid → user; bad signature → 401; wrong `iss` → 401; wrong `aud` → 401; expired → 401; missing `sub` → 401.
- `auth.guard.spec.ts` — guard extracts bearer, delegates to strategy, populates `request.user`, surfaces correct error codes.
- `config/env.schema.spec.ts` — valid env parses; missing `SUPABASE_URL` throws; bad URL throws.

**E2E (Jest + supertest, full Nest app):**

- `GET /health` → 200 without auth.
- `GET /me` without header → 401 `missing_token`.
- `GET /me` with expired token (signed with test key) → 401 `token_expired`.
- `GET /me` with valid token → 200 and correct `{ id, email, provider }`.
- CORS: preflight from `CORS_ORIGIN` succeeds; from other origin fails.

**Fake Supabase:** the JWKS client is abstracted behind a `JwksProvider` DI token. Tests provide a locally generated JWKS; production wires the real remote JWKS. No Supabase dev-stack, no network in CI.

**No integration test against real Supabase in this spec.** It is a manual smoke check after first deploy, listed in §8.

## 7. Developer workflow

```bash
pnpm install                    # installs all workspaces
pnpm --filter web dev           # Vite on :5173 — unchanged from today
pnpm --filter api start:dev     # Nest on :3000 with HMR
pnpm --filter api test          # unit tests
pnpm --filter api test:e2e      # e2e
pnpm lint                       # runs in both workspaces
pnpm typecheck                  # runs in both workspaces
```

- `apps/api/.env.example` documents every required var; `.env` gitignored.
- Husky + lint-staged stay at repo root and run against both workspaces.

## 8. Definition of done

1. Existing frontend runs unchanged from `apps/web/` — all current tests, Storybook, and build pass.
2. `apps/api` boots; `/health` returns 200; `/me` validates a real Supabase-issued Google JWT end-to-end (manual smoke after first deploy).
3. All unit + e2e tests in §6 pass locally and in CI.
4. `packages/shared` exists with at least one shared type exported and consumed by both apps (e.g. `Signer` moved from `src/types/sealdTypes.ts`).
5. Lint + typecheck pass across all three workspaces.
6. `apps/api/README.md` documents env setup and the auth contract (failure-modes table from §5).

## 9. Risks and mitigations

- **Moving the frontend breaks imports / Storybook / ESLint layer rules.** Mitigation: the move is a path-only change; all configs, paths in `.eslintrc.cjs`, and Storybook config are updated in lockstep and verified by running the full existing test suite unchanged before/after.
- **JWKS endpoint flakiness or cache staleness.** Mitigation: `jose`'s `createRemoteJWKSet` handles TTL and cooldown; on signature failure we force a JWKS refresh once before rejecting.
- **Env misconfiguration in prod.** Mitigation: zod schema fails fast at boot; `.env.example` and README document required vars.
- **CORS lockout during local dev.** Mitigation: default `CORS_ORIGIN` matches `http://localhost:5173`; documented override.
