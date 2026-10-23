-- Rollback for 0047_new_link_requested.sql.
--
-- Removes the new_link_requested email kind. Postgres cannot drop one enum
-- label, so the type is cloned without it (the same approach as the 0037
-- rollback). Rows of that kind are deleted first. Idempotent.

begin;

do $$
declare
  kept text;
begin
  if exists (
    select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'email_kind'
       and e.enumlabel = 'new_link_requested'
  ) then
    delete from public.outbound_emails where kind::text = 'new_link_requested';

    select string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder)
      into kept
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'email_kind'
       and e.enumlabel <> 'new_link_requested';

    execute format('create type email_kind_v0047 as enum (%s)', kept);
    alter table public.outbound_emails
      alter column kind type email_kind_v0047
      using kind::text::email_kind_v0047;
    drop type email_kind;
    alter type email_kind_v0047 rename to email_kind;
  end if;
end
$$;

delete from public.schema_migrations
 where filename = '0047_new_link_requested.sql';

commit;
