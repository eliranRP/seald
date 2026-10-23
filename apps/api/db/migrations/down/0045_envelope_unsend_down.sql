-- Rollback for 0045_envelope_unsend.sql.
--
-- Run it only after rolling the API image back to a build without
-- POST /envelopes/:id/unsend.
--
-- Postgres cannot drop one enum label, so each type is cloned without the
-- new label, built from pg_enum so labels added by later migrations
-- survive (as down/0039 does). `unsent` events are rewritten to `created`
-- (the closest pre-0045 label; this breaks the prev_event_hash chain of
-- the affected envelopes, the accepted cost of rolling back an audit
-- type). `canceled` mail rows are deleted: they never went out.
--
-- Idempotent: each clone runs only while its label is still present.

begin;

do $$
declare
  labels text;
begin
  if exists (
    select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'event_type'
       and e.enumlabel = 'unsent'
  ) then
    update public.envelope_events
       set event_type = 'created'
     where event_type::text = 'unsent';

    select string_agg(quote_literal(e.enumlabel), ',' order by e.enumsortorder)
      into labels
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'event_type'
       and e.enumlabel <> 'unsent';

    execute format('create type event_type_v0045 as enum (%s)', labels);

    alter table public.envelope_events
      alter column event_type type event_type_v0045
      using event_type::text::event_type_v0045;

    drop type event_type;
    alter type event_type_v0045 rename to event_type;
  end if;
end
$$;

do $$
declare
  labels text;
begin
  if exists (
    select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'email_status'
       and e.enumlabel = 'canceled'
  ) then
    delete from public.outbound_emails where status::text = 'canceled';

    -- The partial index names enum literals; drop and rebuild it around
    -- the column type change.
    drop index if exists public.outbound_emails_pending_idx;

    select string_agg(quote_literal(e.enumlabel), ',' order by e.enumsortorder)
      into labels
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'email_status'
       and e.enumlabel <> 'canceled';

    execute format('create type email_status_v0045 as enum (%s)', labels);

    alter table public.outbound_emails alter column status drop default;
    alter table public.outbound_emails
      alter column status type email_status_v0045
      using status::text::email_status_v0045;
    alter table public.outbound_emails
      alter column status set default 'pending';

    drop type email_status;
    alter type email_status_v0045 rename to email_status;

    create index if not exists outbound_emails_pending_idx
      on public.outbound_emails (scheduled_for)
      where status in ('pending','failed');
  end if;
end
$$;

delete from public.schema_migrations
 where filename = '0045_envelope_unsend.sql';

commit;
