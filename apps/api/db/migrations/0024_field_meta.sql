-- 0024 — field meta + new field kinds + envelope date format (WP-07).
--
-- envelope_fields gains four kinds (name, number, radio, dropdown) and a
-- `meta` jsonb column holding the per-kind options (label, placeholder,
-- read_only, font_size, char_limit, min/max, options, default ...). The
-- shape is validated by the shared Zod union in
-- packages/shared/src/field-meta.ts before it is written; the column only
-- guarantees it is a JSON object.
--
-- envelopes gains `date_format` and `timezone`. Both are null by default,
-- which keeps today's behaviour (the date field stores and burns in the
-- text the signer sent). The API reads, writes and returns all of this
-- only while the `fieldMetaV2` flag is on, so with the flag off nothing
-- observable changes.
--
-- Idempotent: `add value if not exists`, `add column if not exists`.
-- RLS: no new table. Rollback: down/0024_field_meta_down.sql.

alter type field_kind add value if not exists 'name';
alter type field_kind add value if not exists 'number';
alter type field_kind add value if not exists 'radio';
alter type field_kind add value if not exists 'dropdown';

alter table public.envelope_fields
  add column if not exists meta jsonb not null default '{}'::jsonb;

alter table public.envelope_fields
  drop constraint if exists envelope_fields_meta_is_object;
alter table public.envelope_fields
  add constraint envelope_fields_meta_is_object check (jsonb_typeof(meta) = 'object');

alter table public.envelopes
  add column if not exists date_format text,
  add column if not exists timezone text;

alter table public.envelopes
  drop constraint if exists envelopes_date_format_len;
alter table public.envelopes
  add constraint envelopes_date_format_len
  check (date_format is null or char_length(date_format) between 1 and 40);

alter table public.envelopes
  drop constraint if exists envelopes_timezone_len;
alter table public.envelopes
  add constraint envelopes_timezone_len
  check (timezone is null or char_length(timezone) between 1 and 64);
