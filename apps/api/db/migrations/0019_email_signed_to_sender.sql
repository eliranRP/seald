-- 0019_email_signed_to_sender.sql
-- Sender notice when a signer finishes, plus a dedupe key so a retry
-- cannot enqueue the same notice twice.
--
-- The existing unique (envelope_id, signer_id, kind, source_event_id)
-- does not cover sender-addressed rows: signer_id is null, and Postgres
-- treats nulls as distinct. dedupe_key is always set (callers pass a
-- stable key; the default only covers legacy inserts).

alter type email_kind add value if not exists 'signed_to_sender';

alter table public.outbound_emails
  add column if not exists dedupe_key text;

update public.outbound_emails
   set dedupe_key = 'legacy:' || id::text
 where dedupe_key is null;

alter table public.outbound_emails
  alter column dedupe_key set default gen_random_uuid()::text;

alter table public.outbound_emails
  alter column dedupe_key set not null;

create unique index if not exists outbound_emails_dedupe_key_key
  on public.outbound_emails (dedupe_key);
