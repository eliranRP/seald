-- Rollback for 0035_locales.sql.

begin;

alter table public.envelope_signers drop constraint if exists envelope_signers_locale_supported;
alter table public.envelopes drop constraint if exists envelopes_locale_supported;

alter table public.envelope_signers drop column if exists locale;
alter table public.envelopes drop column if exists locale;

delete from public.schema_migrations
 where filename = '0035_locales.sql';

commit;
