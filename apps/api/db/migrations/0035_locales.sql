-- 0035 — envelope and signer locale (WP-38).
--
-- `envelopes.locale` is the sender's choice for the signing experience and
-- emails; `envelope_signers.locale` overrides it per signer. Both are null
-- by default, which means "use the default locale (en)". The API reads,
-- writes and returns them only while the `i18n` flag is on.
--
-- The check constraints list the values of SUPPORTED_LOCALES
-- (packages/shared/src/locales.ts). Adding a locale = add it to that array,
-- add the catalog, and ship a NEW forward migration that drops and re-adds
-- both constraints with the longer list (same pattern as below). The jest
-- spec apps/api/src/i18n/locale-migration.spec.ts fails until it does.
--
-- Idempotent: `add column if not exists`, drop-then-add constraints.
-- RLS: no new table. Rollback: down/0035_locales_down.sql.

alter table public.envelopes
  add column if not exists locale text;

alter table public.envelope_signers
  add column if not exists locale text;

alter table public.envelopes
  drop constraint if exists envelopes_locale_supported;
alter table public.envelopes
  add constraint envelopes_locale_supported
  check (locale is null or locale in ('en'));

alter table public.envelope_signers
  drop constraint if exists envelope_signers_locale_supported;
alter table public.envelope_signers
  add constraint envelope_signers_locale_supported
  check (locale is null or locale in ('en'));
