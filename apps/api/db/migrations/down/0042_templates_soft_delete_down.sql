-- Rollback for 0042_templates_soft_delete.sql.
--
-- Run it only after rolling the API image back to a build that hard-deletes
-- templates. Soft-deleted rows are removed first, then the column is dropped.
-- Idempotent.

begin;

delete from public.templates where deleted_at is not null;

drop index if exists public.templates_deleted_idx;
alter table public.templates drop column if exists deleted_at;

commit;
