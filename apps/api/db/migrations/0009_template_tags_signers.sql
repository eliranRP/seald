-- 0009_template_tags_signers.sql
-- Two follow-on columns for templates:
--   - tags: jsonb string[] for client-side filtering / grouping in the
--     `/templates` list (TagFilterMenu + GroupByTag toggle on the SPA).
--   - last_signers: jsonb {id,name,email,color}[] captured on each
--     "Send and update template" so the next user of the template
--     starts with the previous signer roster pre-filled (saves picking
--     the same recipients every time).
--
-- Both are jsonb (not separate child tables) for the same reasons as
-- field_layout (0008): bounded shape, atomic read/write, no per-row
-- query needs. Both default to empty arrays so existing rows roll
-- forward without a backfill.

alter table public.templates
  add column tags          jsonb not null default '[]'::jsonb,
  add column last_signers  jsonb not null default '[]'::jsonb;

comment on column public.templates.tags is
  'JSON array of string tags. Used by the SPA''s template-list filter / group-by-tag toggle. Bounded ≤ 32 entries by class-validator at the HTTP boundary.';

comment on column public.templates.last_signers is
  'JSON array of { id, name, email, color } captured on the most recent "Send and update template" so the next use of this template pre-fills the signer roster. Bounded ≤ 50 entries.';
