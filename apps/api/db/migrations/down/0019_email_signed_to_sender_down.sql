-- Rollback for 0019_email_signed_to_sender.sql.
--
-- Drops the dedupe key, then removes the signed_to_sender email kind.
-- Postgres cannot drop a single enum label, so the type is cloned
-- without that label. Rows of the new kind are deleted first; they
-- have no pre-0019 equivalent.

begin;

drop index if exists public.outbound_emails_dedupe_key_key;

alter table public.outbound_emails
  drop column if exists dedupe_key;

delete from public.outbound_emails
 where kind::text = 'signed_to_sender';

create type email_kind_v0018 as enum (
  'invite','reminder','completed','declined_to_sender',
  'withdrawn_to_signer','withdrawn_after_sign',
  'expired_to_sender','expired_to_signer'
);

alter table public.outbound_emails
  alter column kind type email_kind_v0018
  using kind::text::email_kind_v0018;

drop type email_kind;
alter type email_kind_v0018 rename to email_kind;

delete from public.schema_migrations
 where filename = '0019_email_signed_to_sender.sql';

commit;
