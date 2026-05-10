-- Rollback for 0016_envelopes_tags.sql.

begin;

alter table public.envelopes drop column if exists tags;

commit;
