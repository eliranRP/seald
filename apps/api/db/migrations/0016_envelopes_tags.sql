-- 0016 — add a `tags` jsonb column to envelopes.
--
-- Mirrors `templates.tags` (jsonb of string array). Lets the user
-- attach short labels to envelopes ("Urgent", "Wickliff") and filter
-- the dashboard by them. Per-user / per-envelope cap is enforced by
-- the API DTO (max 10 tags, 32 chars each); the column itself is the
-- least-restrictive possible shape.
--
-- Default `'[]'::jsonb` is non-null so existing rows backfill with an
-- empty array — safe to roll out without a follow-up data migration.

begin;

alter table public.envelopes
  add column if not exists tags jsonb not null default '[]'::jsonb;

commit;
