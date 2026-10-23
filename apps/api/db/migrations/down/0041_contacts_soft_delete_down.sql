-- Rollback for 0041_contacts_soft_delete.sql.
--
-- Run it only after rolling the API image back to a build that hard-deletes
-- contacts. Soft-deleted rows are removed first (they were meant to be gone),
-- then the whole-table unique index is restored and the column dropped.
-- Idempotent.

begin;

delete from public.contacts where deleted_at is not null;

drop index if exists public.contacts_deleted_idx;
drop index if exists public.contacts_owner_email_uniq;
create unique index if not exists contacts_owner_email_uniq
  on public.contacts (owner_id, email);

alter table public.contacts drop column if exists deleted_at;

commit;
