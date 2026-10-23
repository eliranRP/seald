-- Rollback for 0030_mcp_approvals.sql.
--
-- Run it only together with an API image that has no approvals module.
-- Every pending approval is lost; an agent has to ask again after the
-- feature is back.
--
-- - Drops mcp_approvals, mcp_confirmations and api_keys.approval_notify.
-- - `approval_decided` events are deleted, then `event_type` is cloned
--   without the label (built from pg_enum, so labels added by later
--   migrations survive, as down/0026 does). Deleting audit rows breaks
--   the prev_event_hash chain of the affected envelopes: the accepted
--   cost of rolling back an audit type. There is no pre-0030 label that
--   means the same thing, so the rows are not rewritten.
-- - `approval_request` / `approval_denied` outbox rows are deleted (they
--   carry only an approval id) and `email_kind` is cloned without them.
--
-- Idempotent: drops are `if exists`; each enum clone runs only while one
-- of its labels is still present.

begin;

drop table if exists public.mcp_confirmations;
drop table if exists public.mcp_approvals;

do $$
begin
  if to_regclass('public.api_keys') is not null then
    alter table public.api_keys drop constraint if exists api_keys_approval_notify_check;
    alter table public.api_keys drop column if exists approval_notify;
  end if;
end $$;

do $$
declare
  labels text;
begin
  if exists (
    select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'event_type'
       and e.enumlabel = 'approval_decided'
  ) then
    delete from public.envelope_events where event_type::text = 'approval_decided';

    select string_agg(quote_literal(e.enumlabel), ',' order by e.enumsortorder)
      into labels
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'event_type'
       and e.enumlabel <> 'approval_decided';

    execute format('create type event_type_v0029 as enum (%s)', labels);

    alter table public.envelope_events
      alter column event_type type event_type_v0029
      using event_type::text::event_type_v0029;

    drop type event_type;
    alter type event_type_v0029 rename to event_type;
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
       and e.enumlabel in ('approval_request', 'approval_denied')
  ) then
    delete from public.outbound_emails
     where kind::text in ('approval_request', 'approval_denied');

    select string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder)
      into kept
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'email_kind'
       and e.enumlabel not in ('approval_request', 'approval_denied');

    execute format('create type email_kind_v0029 as enum (%s)', kept);
    alter table public.outbound_emails
      alter column kind type email_kind_v0029
      using kind::text::email_kind_v0029;
    drop type email_kind;
    alter type email_kind_v0029 rename to email_kind;
  end if;
end
$$;

delete from public.schema_migrations
 where filename = '0030_mcp_approvals.sql';

commit;
