-- 0036 — MCP OAuth 2.1 (parity plan WP-27, decision D3).
--
-- docs/design/mcp-server.md § OAuth 2.1. Seald's API is the resource
-- server for `/mcp` and a thin authorization server; Supabase stays the
-- identity provider behind the consent page. Public clients only (PKCE
-- S256, no client secret). Dynamic client registration stays off: a
-- client is either pre-registered (env allow-list) or a Client ID
-- Metadata Document (CIMD, an https client id the API fetches).
--
-- - `oauth_clients`: one row per client id seen at consent time, a
--   snapshot of its name and redirect URIs. Grants point at it, so a
--   renamed or vanished CIMD document never rewrites an audit trail.
-- - `oauth_grants`: one live grant per (owner, client). It carries the
--   same owner settings as an API key (`require_owner_approval`,
--   `allow_new_recipients`, `always_require_signin`, `approval_notify`)
--   with the same defaults. Revocation sets `revoked_at` and keeps the
--   row until account deletion (`on delete cascade` from auth.users).
-- - `oauth_authorization_codes`: single use, 60 seconds, bound to the
--   owner, client, exact redirect URI, S256 challenge, resource and
--   scopes. Codes live here, never in memory.
-- - `oauth_refresh_tokens` / `oauth_access_tokens`: only SHA-256 hashes.
--   `family_id` is the authorization code a chain of refresh tokens grew
--   from. Refresh rotates; replaying a rotated refresh token revokes the
--   whole grant.
-- - RLS on, no policies (same posture as api_keys). The API role
--   bypasses RLS.
--
-- Idempotent: every statement is `if not exists`.

create table if not exists public.oauth_clients (
  id            uuid primary key default gen_random_uuid(),
  client_id     text not null check (char_length(client_id) between 1 and 2048),
  kind          text not null check (kind in ('preregistered', 'cimd')),
  client_name   text not null check (char_length(client_name) between 1 and 200),
  redirect_uris text[] not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists oauth_clients_client_id_key
  on public.oauth_clients (client_id);

alter table public.oauth_clients enable row level security;

create table if not exists public.oauth_grants (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null references auth.users(id) on delete cascade,
  client_ref             uuid not null references public.oauth_clients(id) on delete cascade,
  scopes                 text[] not null,
  require_owner_approval boolean not null default true,
  allow_new_recipients   boolean not null default false,
  always_require_signin  boolean not null default false,
  approval_notify        text not null default 'email'
                         check (approval_notify in ('email', 'none')),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  last_used_at           timestamptz,
  revoked_at             timestamptz,
  revoked_reason         text check (revoked_reason is null or char_length(revoked_reason) <= 64)
);

-- One live grant per owner and client; a new consent updates it.
create unique index if not exists oauth_grants_owner_client_live_idx
  on public.oauth_grants (owner_id, client_ref) where revoked_at is null;

-- Connected apps on the Developers page.
create index if not exists oauth_grants_owner_created_idx
  on public.oauth_grants (owner_id, created_at desc);

alter table public.oauth_grants enable row level security;

create table if not exists public.oauth_authorization_codes (
  id             uuid primary key default gen_random_uuid(),
  code_hash      text not null check (char_length(code_hash) = 64),
  grant_id       uuid not null references public.oauth_grants(id) on delete cascade,
  owner_id       uuid not null references auth.users(id) on delete cascade,
  client_ref     uuid not null references public.oauth_clients(id) on delete cascade,
  redirect_uri   text not null,
  code_challenge text not null check (char_length(code_challenge) = 43),
  resource       text not null,
  scopes         text[] not null,
  expires_at     timestamptz not null,
  consumed_at    timestamptz,
  created_at     timestamptz not null default now()
);

create unique index if not exists oauth_authorization_codes_hash_key
  on public.oauth_authorization_codes (code_hash);

alter table public.oauth_authorization_codes enable row level security;

create table if not exists public.oauth_refresh_tokens (
  id                  uuid primary key default gen_random_uuid(),
  token_hash          text not null check (char_length(token_hash) = 64),
  grant_id            uuid not null references public.oauth_grants(id) on delete cascade,
  family_id           uuid not null,
  client_ref          uuid not null references public.oauth_clients(id) on delete cascade,
  scopes              text[] not null,
  resource            text not null,
  absolute_expires_at timestamptz not null,
  idle_expires_at     timestamptz not null,
  rotated_at          timestamptz,
  revoked_at          timestamptz,
  created_at          timestamptz not null default now()
);

create unique index if not exists oauth_refresh_tokens_hash_key
  on public.oauth_refresh_tokens (token_hash);
create index if not exists oauth_refresh_tokens_family_idx
  on public.oauth_refresh_tokens (family_id);
create index if not exists oauth_refresh_tokens_grant_idx
  on public.oauth_refresh_tokens (grant_id);

alter table public.oauth_refresh_tokens enable row level security;

create table if not exists public.oauth_access_tokens (
  id          uuid primary key default gen_random_uuid(),
  token_hash  text not null check (char_length(token_hash) = 64),
  grant_id    uuid not null references public.oauth_grants(id) on delete cascade,
  family_id   uuid not null,
  client_ref  uuid not null references public.oauth_clients(id) on delete cascade,
  scopes      text[] not null,
  resource    text not null,
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);

create unique index if not exists oauth_access_tokens_hash_key
  on public.oauth_access_tokens (token_hash);
create index if not exists oauth_access_tokens_family_idx
  on public.oauth_access_tokens (family_id);
create index if not exists oauth_access_tokens_grant_idx
  on public.oauth_access_tokens (grant_id);

alter table public.oauth_access_tokens enable row level security;
