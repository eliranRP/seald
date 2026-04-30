-- 0010_template_example_pdf.sql
-- Persist a per-template "example PDF" so when a user re-opens a saved
-- template we can show the original document, not a synthesized 1-byte
-- placeholder. The path is the Supabase Storage object key (relative to
-- the configured bucket), populated by `POST /templates/:id/example`
-- after a `POST /templates` create succeeds.
--
-- Nullable: legacy templates rolled forward without one (the SPA falls
-- back to its placeholder canvas), and templates created via API-only
-- callers (Postman, integration tests) may legitimately have no PDF.
alter table public.templates
  add column example_pdf_path text;

comment on column public.templates.example_pdf_path is
  'Supabase Storage object key (relative to STORAGE_BUCKET) for the example PDF the sender uploaded when the template was created. Nullable -- UI falls back to a placeholder canvas when absent. Populated via POST /templates/:id/example after the template row exists.';
