-- Rollback for 0040_email_bounces.sql.
--
-- Run it only after rolling the API image back to a build without the
-- Resend bounce webhook. Postgres cannot drop one enum label, so each type
-- is cloned without the new labels, built from pg_enum so labels added by
-- later migrations survive (as down/0046 does). `email_bounced` events are
-- rewritten to `viewed`, the closest earlier label; that breaks the
-- prev_event_hash chain of the affected envelopes, the accepted cost of
-- rolling back an audit type. `your_turn` and `bounced_to_sender` outbox
-- rows are deleted.
--
-- Idempotent: each clone runs only while its labels are still present.

begin;

alter table public.envelope_signers
  drop constraint if exists envelope_signers_delivery_status_check;
alter table public.envelope_signers
  drop column if exists delivery_status,
  drop column if exists bounced_at,
  drop column if exists bounce_reason;

do $$
declare
  labels text;
begin
  if exists (
    select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'event_type'
       and e.enumlabel in ('email_bounced')
  ) then
    update public.envelope_events
       set event_type = 'viewed'
     where event_type::text in ('email_bounced');

    select string_agg(quote_literal(e.enumlabel), ',' order by e.enumsortorder)
      into labels
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'event_type'
       and e.enumlabel not in ('email_bounced');

    execute format('create type event_type_v0040 as enum (%s)', labels);

    alter table public.envelope_events
      alter column event_type type event_type_v0040
      using event_type::text::event_type_v0040;

    drop type event_type;
    alter type event_type_v0040 rename to event_type;
  end if;
end
$$;

do $$
declare
  kept text;
begin
  if exists (
    select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'email_kind'
       and e.enumlabel in ('your_turn', 'bounced_to_sender')
  ) then
    delete from public.outbound_emails
     where kind::text in ('your_turn', 'bounced_to_sender');

    select string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder)
      into kept
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'email_kind'
       and e.enumlabel not in ('your_turn', 'bounced_to_sender');

    execute format('create type email_kind_v0040 as enum (%s)', kept);
    alter table public.outbound_emails
      alter column kind type email_kind_v0040
      using kind::text::email_kind_v0040;
    drop type email_kind;
    alter type email_kind_v0040 rename to email_kind;
  end if;
end
$$;

delete from public.schema_migrations
 where filename = '0040_email_bounces.sql';

commit;
