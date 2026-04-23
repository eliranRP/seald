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
