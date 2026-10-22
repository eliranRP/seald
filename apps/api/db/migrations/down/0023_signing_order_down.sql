-- Rollback for 0023_signing_order.sql.
--
-- Run it only after rolling the API image back to a build without
-- signing order. Sequential envelopes still in flight lose their step
-- state: the older build invites nobody new, so their later steps never
-- get a link. Cancel or resend those first.
--
-- `step_started` events are rewritten to `sent` (the closest pre-0023
-- synonym) before the enum is cloned without the label, as down/0018 and
-- down/0022 do. Rewriting event_type breaks the prev_event_hash chain of
-- the affected envelopes; that is the accepted cost of rolling back an
-- audit-trail type. The clone keeps every other label, in order, so it
-- also works on a database that already has labels added after 0023.
--
-- Idempotent: every drop is `if exists`, and the enum clone runs only
-- while the label is still present.

begin;

drop index if exists public.envelope_signers_envelope_order_idx;
alter table public.envelope_signers drop column if exists invited_at;

do $$
declare
  labels text;
begin
  if exists (
    select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'event_type'
       and e.enumlabel = 'step_started'
  ) then
    update public.envelope_events
       set event_type = 'sent'
     where event_type = 'step_started';

    select string_agg(quote_literal(e.enumlabel), ',' order by e.enumsortorder)
      into labels
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'event_type'
       and e.enumlabel <> 'step_started';

    execute format('create type event_type_v0022 as enum (%s)', labels);

    alter table public.envelope_events
      alter column event_type type event_type_v0022
      using event_type::text::event_type_v0022;

    drop type event_type;
    alter type event_type_v0022 rename to event_type;
  end if;
end
$$;

commit;
