-- 0023 — placement version + page geometry captured at upload.
--
-- placement_version 1 is the MediaBox seal (no /Rotate, checkbox drawn
-- beside the field). Rows that already exist stay on 1 so re-sealing
-- them does not move fields that were placed with that math.
-- The application inserts new drafts as 2 (displayed-page fractions:
-- CropBox, /Rotate). The column default stays 1 so any writer that
-- omits the column cannot silently opt a row into the new seal.
--
-- original_page_geometry is a jsonb array, one object per page:
--   {page, view_width, view_height, rotation, mediabox, cropbox}
-- mediabox and cropbox are PDF user-space rectangles. view_width and
-- view_height are the displayed page (CropBox, /Rotate applied).
-- view_* are the displayed page in PDF points. Null until upload.
-- Place-fields uses the array length as the page count.
--
-- lock_timeout: ADD COLUMN ... DEFAULT rewrites nothing for a constant
-- default on Postgres 11+, but the ACCESS EXCLUSIVE lock still waits
-- behind any open transaction. Fail in 5 seconds instead of queueing
-- envelope reads. migrate.sh applies this file in one transaction
-- (psql -1), so SET LOCAL covers both statements.

set local lock_timeout = '5s';

alter table public.envelopes
  add column if not exists placement_version smallint not null default 1;

alter table public.envelopes
  drop constraint if exists envelopes_placement_version_check;

alter table public.envelopes
  add constraint envelopes_placement_version_check
  check (placement_version in (1, 2));

alter table public.envelopes
  add column if not exists original_page_geometry jsonb;

comment on column public.envelopes.placement_version is
  '1 = MediaBox seal for envelopes placed before displayed-page math. 2 = CropBox + /Rotate fractions. Existing rows stay 1; new drafts are inserted as 2.';

comment on column public.envelopes.original_page_geometry is
  'Per-page displayed geometry captured at upload: [{page, view_width, view_height, rotation, mediabox, cropbox}]. Null until a PDF is stored. Page count for field bounds is the array length.';
