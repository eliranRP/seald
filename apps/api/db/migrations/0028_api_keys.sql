-- 0028 — API keys (MCP step 2, parity plan WP-14).
--
-- One table, as written in docs/design/mcp-server.md § API keys. The same
-- keys authenticate `/mcp` and the public REST API `/api/v1` (parity plan
-- D1). Key management stays on the Supabase session (`/me/api-keys`).
--
-- - The secret is never stored. `key_hash` is hex SHA-256 of the secret;
--   `prefix` (`seald_live_` + the first 8 secret characters) is the
--   lookup key and is unique across every row, live or revoked.
-- - Revocation sets `revoked_at` and keeps the row, so audit snapshots of
--   `key_name` / `key_prefix` keep matching a row. Only account deletion
--   removes rows (`on delete cascade` from auth.users).
-- - At most 10 live keys per owner. The API enforces the cap under
--   `pg_advisory_xact_lock` on the owner id; the partial unique index on
--   `(owner_id, lower(name))` is the backstop for concurrent creates.
-- - RLS on, no policies (the 0015 lesson). The API role bypasses RLS.
-- - New email kind `api_key_created`: the owner is told a key was made.
--   The mail names the key and its prefix, never the secret.
--
-- Idempotent: every statement is `if not exists`.

create table if not exists public.api_keys (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users(id) on delete cascade,
  name                text not null check (char_length(name) between 1 and 80),
  prefix              text not null,
  key_hash            text not null check (char_length(key_hash) = 64),
  scopes              text[] not null,
  require_owner_approval boolean not null default true,
  allow_new_recipients boolean not null default false,
  always_require_signin boolean not null default false,
  created_at          timestamptz not null default now(),
  last_used_at        timestamptz,
  expires_at          timestamptz,
  revoked_at          timestamptz
);

create unique index if not exists api_keys_prefix_key
  on public.api_keys (prefix);

create unique index if not exists api_keys_owner_name_live_idx
  on public.api_keys (owner_id, lower(name)) where revoked_at is null;

-- `GET /me/api-keys` and the per-owner name scan behind `Key N`.
create index if not exists api_keys_owner_created_idx
  on public.api_keys (owner_id, created_at desc);

alter table public.api_keys enable row level security;

alter type email_kind add value if not exists 'api_key_created';
