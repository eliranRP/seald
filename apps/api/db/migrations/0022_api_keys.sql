-- 0022_api_keys.sql
-- Agent access keys. The secret is not stored. key_hash is hex SHA-256
-- of the full seald_live_ token. 0021 is the Drive token erasure
-- migration, so this feature takes 0022.
--
-- api_key_created is the owner notice. The payload names the key and
-- the prefix. It does not carry the secret.
--
-- lock_timeout: owner_id references auth.users, and adding that foreign
-- key takes SHARE ROW EXCLUSIVE on auth.users. If the lock has to wait
-- behind a long transaction, every sign-in and sign-up queues behind
-- this migration. Fail in 5 seconds instead. migrate.sh applies the
-- file in one transaction (psql -1), so SET LOCAL covers every
-- statement below. Same precedent as 0021.

set local lock_timeout = '5s';

alter type email_kind add value if not exists 'api_key_created';

create table if not exists public.api_keys (
  id                       uuid primary key default gen_random_uuid(),
  owner_id                 uuid not null references auth.users(id) on delete cascade,
  name                     text not null check (char_length(name) between 1 and 80),
  prefix                   text not null,
  key_hash                 text not null check (char_length(key_hash) = 64),
  scopes                   text[] not null,
  require_owner_approval   boolean not null default true,
  allow_new_recipients     boolean not null default false,
  always_require_signin    boolean not null default false,
  created_at               timestamptz not null default now(),
  last_used_at             timestamptz,
  expires_at               timestamptz not null,
  revoked_at               timestamptz
);

create unique index if not exists api_keys_prefix_key on public.api_keys (prefix);

create unique index if not exists api_keys_owner_name_live_idx
  on public.api_keys (owner_id, lower(name)) where revoked_at is null;

alter table public.api_keys enable row level security;

-- Prod's default ACL grants anon and authenticated ALL on every new
-- public table. RLS with no policies already denies rows, and the API
-- connects as a role that bypasses RLS. Revoke the grants anyway: this
-- table holds credential hashes. Roles are absent on a bare Postgres,
-- so skip the revoke there. Supabase has both roles.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table public.api_keys from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table public.api_keys from authenticated;
  end if;
end $$;
