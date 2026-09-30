-- 0022_api_keys.sql
-- Agent access keys. The secret is not stored. key_hash is hex SHA-256
-- of the full seald_live_ token. 0021 is reserved by #370, so this
-- feature takes 0022.
--
-- api_key_created is the owner notice. The payload names the key and
-- the prefix. It does not carry the secret.

alter type email_kind add value if not exists 'api_key_created';

create table public.api_keys (
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
  expires_at               timestamptz,
  revoked_at               timestamptz
);

create unique index api_keys_prefix_key on public.api_keys (prefix);

create unique index api_keys_owner_name_live_idx
  on public.api_keys (owner_id, lower(name)) where revoked_at is null;

alter table public.api_keys enable row level security;
