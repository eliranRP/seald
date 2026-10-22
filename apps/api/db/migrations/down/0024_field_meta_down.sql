-- Rollback for 0024_field_meta.sql.
--
-- Run it only after rolling the API image back to a build that does not
-- know the new kinds. Data loss: every field of kind name, number, radio
-- or dropdown is deleted (a pre-0024 build cannot render or seal them),
-- and all meta plus the envelope date_format / timezone are dropped.
-- Postgres cannot drop a single enum label, so the type is cloned
-- without the new labels, as down/0019 does.
--
-- Idempotent: drops are `if exists`; the enum clone runs only while one
-- of the labels is still present.

begin;

alter table public.envelopes drop constraint if exists envelopes_date_format_len;
alter table public.envelopes drop constraint if exists envelopes_timezone_len;
alter table public.envelopes
  drop column if exists date_format,
  drop column if exists timezone;

alter table public.envelope_fields drop constraint if exists envelope_fields_meta_is_object;
alter table public.envelope_fields drop column if exists meta;

do $$
begin
  if exists (
    select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'field_kind'
       and e.enumlabel in ('name','number','radio','dropdown')
  ) then
    delete from public.envelope_fields
     where kind::text in ('name','number','radio','dropdown');

    create type field_kind_v0023 as enum (
      'signature','initials','date','text','checkbox','email'
    );

    alter table public.envelope_fields
      alter column kind type field_kind_v0023
      using kind::text::field_kind_v0023;

    drop type field_kind;
    alter type field_kind_v0023 rename to field_kind;
  end if;
end
$$;

delete from public.schema_migrations
 where filename = '0024_field_meta.sql';

commit;
