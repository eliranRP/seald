-- Rollback for 0037_automation_disabled.sql.
--
-- Drops the disable columns on `automations` and removes the
-- automation_disabled email kind. Postgres cannot drop one enum label, so
-- the type is cloned without it (the same approach as the 0032 rollback).
-- Rows of that kind are deleted first. Recipes that were auto-disabled stay
-- disabled after this rollback, with no record of why. Run it only with an
-- image that has no auto-disable code. Idempotent.

begin;

alter table public.automations drop constraint if exists automations_disabled_reason_chk;
alter table public.automations drop column if exists disabled_reason;
alter table public.automations drop column if exists disabled_at;

do $$
declare
  kept text;
begin
  if exists (
    select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'email_kind'
       and e.enumlabel = 'automation_disabled'
  ) then
    delete from public.outbound_emails where kind::text = 'automation_disabled';

    select string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder)
      into kept
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'email_kind'
       and e.enumlabel <> 'automation_disabled';

    execute format('create type email_kind_v0037 as enum (%s)', kept);
    alter table public.outbound_emails
      alter column kind type email_kind_v0037
      using kind::text::email_kind_v0037;
    drop type email_kind;
    alter type email_kind_v0037 rename to email_kind;
  end if;
end
$$;

delete from public.schema_migrations
 where filename = '0037_automation_disabled.sql';

commit;
