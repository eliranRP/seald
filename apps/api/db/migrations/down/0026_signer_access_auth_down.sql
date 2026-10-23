-- Rollback for 0026_signer_access_auth.sql.
--
-- Run it only after rolling the API image back to a build without the
-- signer access code. Signers that needed a code then open their link
-- without one.
--
-- - Drops the challenge table and the four settings columns, then the
--   `signer_auth_method` enum.
-- - The three event labels are removed by cloning `event_type` without
--   them, built from pg_enum so labels added by later migrations survive
--   (as down/0023 does). Their rows are rewritten to `viewed`, the
--   closest pre-0026 label; that breaks the prev_event_hash chain of the
--   affected envelopes, the accepted cost of rolling back an audit type.
-- - `access_code` outbox rows are deleted (no pre-0026 equivalent; they
--   carry only a challenge id) and `email_kind` is cloned without it.
--
-- Idempotent: drops are `if exists`; each enum clone runs only while its
-- label is still present.

begin;

drop table if exists public.signer_otp_challenges;

alter table public.envelope_signers
  drop column if exists access_auth,
  drop column if exists action_auth;

alter table public.envelopes
  drop column if exists access_auth,
  drop column if exists action_auth;

drop type if exists signer_auth_method;

do $$
declare
  labels text;
begin
  if exists (
    select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'event_type'
       and e.enumlabel in ('access_code_sent', 'access_code_verified', 'access_code_failed')
  ) then
    update public.envelope_events
       set event_type = 'viewed'
     where event_type::text in ('access_code_sent', 'access_code_verified', 'access_code_failed');

    select string_agg(quote_literal(e.enumlabel), ',' order by e.enumsortorder)
      into labels
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'event_type'
       and e.enumlabel not in ('access_code_sent', 'access_code_verified', 'access_code_failed');

    execute format('create type event_type_v0025 as enum (%s)', labels);

    alter table public.envelope_events
      alter column event_type type event_type_v0025
      using event_type::text::event_type_v0025;

    drop type event_type;
    alter type event_type_v0025 rename to event_type;
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
       and e.enumlabel = 'access_code'
  ) then
    delete from public.outbound_emails where kind::text = 'access_code';

    select string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder)
      into kept
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'email_kind'
       and e.enumlabel <> 'access_code';

    execute format('create type email_kind_v0025 as enum (%s)', kept);
    alter table public.outbound_emails
      alter column kind type email_kind_v0025
      using kind::text::email_kind_v0025;
    drop type email_kind;
    alter type email_kind_v0025 rename to email_kind;
  end if;
end
$$;

delete from public.schema_migrations
 where filename = '0026_signer_access_auth.sql';

commit;
