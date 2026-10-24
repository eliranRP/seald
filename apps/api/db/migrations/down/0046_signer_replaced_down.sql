-- Rollback for 0046_signer_replaced.sql.
--
-- Run it only after rolling the API image back to a build without the
-- replace-signer action.
--
-- Postgres cannot drop one enum label, so each type is cloned without the
-- new label, built from pg_enum so labels added by later migrations
-- survive (as down/0039 does). `signer_replaced` events are rewritten to
-- `viewed`, the closest earlier label; that breaks the prev_event_hash
-- chain of the affected envelopes, the accepted cost of rolling back an
-- audit type. `signer_replaced` outbox rows are deleted.
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
       and e.enumlabel in ('signer_replaced')
  ) then
    update public.envelope_events
       set event_type = 'viewed'
     where event_type::text in ('signer_replaced');

    select string_agg(quote_literal(e.enumlabel), ',' order by e.enumsortorder)
      into labels
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'event_type'
       and e.enumlabel not in ('signer_replaced');

    execute format('create type event_type_v0046 as enum (%s)', labels);

    alter table public.envelope_events
      alter column event_type type event_type_v0046
      using event_type::text::event_type_v0046;

    drop type event_type;
    alter type event_type_v0046 rename to event_type;
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
       and e.enumlabel = 'signer_replaced'
  ) then
    delete from public.outbound_emails where kind::text = 'signer_replaced';

    select string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder)
      into kept
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'email_kind'
       and e.enumlabel <> 'signer_replaced';

    execute format('create type email_kind_v0046 as enum (%s)', kept);
    alter table public.outbound_emails
      alter column kind type email_kind_v0046
      using kind::text::email_kind_v0046;
    drop type email_kind;
    alter type email_kind_v0046 rename to email_kind;
  end if;
end
$$;

delete from public.schema_migrations
 where filename = '0046_signer_replaced.sql';

commit;
