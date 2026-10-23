-- 0042 — Templates redesign: soft delete with Undo.
--
-- `deleted_at` marks a template the owner removed. The row stays for 24 hours
-- so the "Template deleted" Undo toast can restore it
-- (POST /templates/:id/restore); the API purges the owner's older
-- soft-deleted rows opportunistically on the next delete. Sent documents
-- never read the template row for their content, so they are untouched.
--
-- Idempotent: every statement is `if not exists`.

alter table public.templates
  add column if not exists deleted_at timestamptz;

create index if not exists templates_deleted_idx
  on public.templates (owner_id, deleted_at)
  where deleted_at is not null;
