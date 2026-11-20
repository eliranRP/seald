-- Rollback for 0052_unattended_send_default.sql: new keys and grants ask
-- the owner before each send again. Existing rows keep their current
-- values (the up script did not record which ones it changed).

alter table public.api_keys
  alter column require_owner_approval set default true,
  alter column allow_new_recipients set default false;

alter table public.oauth_grants
  alter column require_owner_approval set default true,
  alter column allow_new_recipients set default false;
