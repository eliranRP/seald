-- 0041 — Contacts redesign: soft delete with Undo.
--
-- `deleted_at` marks a contact the owner removed. The row stays for 24 hours
-- so the Undo toast can restore it (POST /contacts/restore); the API purges
-- the owner's older soft-deleted rows opportunistically on the next delete.
--
-- Email uniqueness now covers live contacts only: the old whole-table unique
-- index would block re-adding the email of a contact sitting in the Undo
-- window. The new partial index keeps the name `contacts_owner_email_uniq` so
-- the API's unique-violation mapping is unchanged.
--
-- Idempotent: every statement is `if exists` / `if not exists`.

alter table public.contacts
  add column if not exists deleted_at timestamptz;

drop index if exists public.contacts_owner_email_uniq;
create unique index if not exists contacts_owner_email_uniq
  on public.contacts (owner_id, email)
  where deleted_at is null;

create index if not exists contacts_deleted_idx
  on public.contacts (owner_id, deleted_at)
  where deleted_at is not null;
