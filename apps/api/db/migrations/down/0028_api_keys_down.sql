-- Rollback for 0028_api_keys.sql.
--
-- Drops the api_keys table, then removes the api_key_created email kind.
-- Postgres cannot drop one enum label, so the type is cloned without it.
-- The clone is built from the labels present at rollback time (minus
-- api_key_created), so a later migration's labels survive this rollback.
-- Rows of the removed kind are deleted first; they have no pre-0028
-- equivalent. Every live key stops working: run this only together with
-- an image that has no API-key routes. Idempotent.

begin;

drop table if exists public.api_keys;

do $$
declare
  kept text;
begin
  if exists (
    select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'email_kind'
       and e.enumlabel = 'api_key_created'
  ) then
    delete from public.outbound_emails where kind::text = 'api_key_created';

    select string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder)
      into kept
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'email_kind'
       and e.enumlabel <> 'api_key_created';

    execute format('create type email_kind_v0027 as enum (%s)', kept);
    alter table public.outbound_emails
      alter column kind type email_kind_v0027
      using kind::text::email_kind_v0027;
    drop type email_kind;
    alter type email_kind_v0027 rename to email_kind;
  end if;
end
$$;

delete from public.schema_migrations
 where filename = '0028_api_keys.sql';

commit;
