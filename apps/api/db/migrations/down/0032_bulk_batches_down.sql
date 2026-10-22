-- Rollback for 0032_bulk_batches.sql.
--
-- Drops the batch tables, then removes the bulk_complete email kind.
-- Postgres cannot drop one enum label, so the type is cloned without it.
-- The clone is built from the labels present at rollback time (minus
-- bulk_complete), so a later migration's labels survive this rollback.
-- Rows of the removed kind are deleted first; they have no pre-0032
-- equivalent. Envelopes already created by a batch stay: they are ordinary
-- envelopes. Run this only together with an image that has no bulk-send
-- routes or worker. Idempotent.

begin;

drop table if exists public.bulk_batch_rows;
drop table if exists public.bulk_batches;

do $$
declare
  kept text;
begin
  if exists (
    select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'email_kind'
       and e.enumlabel = 'bulk_complete'
  ) then
    delete from public.outbound_emails where kind::text = 'bulk_complete';

    select string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder)
      into kept
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'email_kind'
       and e.enumlabel <> 'bulk_complete';

    execute format('create type email_kind_v0032 as enum (%s)', kept);
    alter table public.outbound_emails
      alter column kind type email_kind_v0032
      using kind::text::email_kind_v0032;
    drop type email_kind;
    alter type email_kind_v0032 rename to email_kind;
  end if;
end
$$;

delete from public.schema_migrations
 where filename = '0032_bulk_batches.sql';

commit;
