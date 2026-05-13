-- Rollback for 0018_event_type_pdf_uploaded.sql.
--
-- Postgres has no native `ALTER TYPE … DROP VALUE`. The standard
-- recipe is: (1) replace all rows that use the new label, (2) clone
-- the enum without the value, (3) re-point every dependent column at
-- the clone, (4) drop the old type, (5) rename the clone back.
--
-- Step (1) maps any `pdf_uploaded` event back to `'created'` — which
-- is the pre-fix behaviour (one combined row at envelope-creation +
-- upload time). The `envelope_events.prev_event_hash` chain is
-- canonical over `event_type`, so rewriting the value breaks the
-- chain for affected envelopes. That is the expected cost of a
-- rollback for an audit-trail type change; the up-script is
-- additive and we never expect this down to run in prod outside a
-- disaster recovery flow.
--
-- The clone-and-swap is wrapped in a single transaction so a failure
-- mid-way leaves the schema usable.

begin;

-- (1) Map any rows already written under the new label back to the
-- only pre-existing close synonym.
update public.envelope_events
   set event_type = 'created'
 where event_type = 'pdf_uploaded';

-- (2) Build a parallel enum without `pdf_uploaded`.
create type event_type_v0017 as enum (
  'created','sent','viewed','tc_accepted',
  'esign_disclosure_acknowledged','intent_to_sign_confirmed','consent_withdrawn',
  'field_filled','signed','all_signed','sealed','declined','expired',
  'canceled','reminder_sent','session_invalidated_by_decline',
  'session_invalidated_by_cancel','job_failed','retention_deleted'
);

-- (3) Re-point the only dependent column.
alter table public.envelope_events
  alter column event_type type event_type_v0017
  using event_type::text::event_type_v0017;

-- (4) + (5) Drop the old enum and rename the clone back to the
-- canonical name so the rest of the schema (and any code in the
-- container) keeps referring to `event_type`.
drop type event_type;
alter type event_type_v0017 rename to event_type;

commit;
