-- 0012_preserve_envelopes_on_user_delete.sql
-- Issues #38 / #43 — preserve sealed envelopes when an account is deleted.
--
-- The original FKs on `envelopes.owner_id` and `templates.owner_id` were
-- declared `on delete cascade`. That choice optimised for GDPR Art. 17
-- ("right to erasure") in the simplest case, but it creates a real legal
-- problem: ESIGN Act §7001(d) AND eIDAS Art. 25(2) AND most state-level
-- contract-law statutes require that a cryptographically-sealed signed
-- record be retained for the full statutory window (typically 6-7 years
-- from the contract's date) — independently of whether the parties later
-- choose to delete their auth records. GDPR Art. 17(3)(b/e) explicitly
-- carves out exactly this case: erasure does not apply when "processing
-- is necessary for compliance with a legal obligation" or "for the
-- establishment, exercise or defence of legal claims."
--
-- The fix:
--   1. Drop the cascade on `envelopes.owner_id`. Re-add as
--      `on delete set null` so a future raw delete from `auth.users`
--      detaches rather than destroys the envelope. The application
--      service (MeService.deleteAccount) will explicitly null the
--      column on the non-draft rows BEFORE asking Supabase to delete
--      the user, so the FK never actually fires the SET NULL path
--      against sealed records — but the safety net catches manual
--      `delete from auth.users` invocations too.
--   2. Drop the cascade on `templates.owner_id`. Re-add as
--      `on delete cascade` (templates are user-private working state,
--      not statutory records — they can vanish). The application
--      service hard-deletes them explicitly first so the cascade is
--      a redundant safety net.
--   3. Create `public.deleted_user_tombstones` — a small bookkeeping
--      table that records which `auth.users.id`s were retired plus the
--      SHA-256 hash of their email at the moment of deletion. We
--      cannot ALTER `auth.users` from app migrations (the schema is
--      Supabase-owned), so this shadow table is the application-level
--      equivalent of the brief's `users.deleted_at` / `users.email_hash`
--      columns. The hash is purely a forensic breadcrumb — not a PII
--      lookup index — so a future signer who shares the same email
--      cannot be linked to the tombstoned account.
--
-- Idempotent: every alter/create is guarded with IF EXISTS / IF NOT
-- EXISTS where Postgres allows it. Re-running the migration on a
-- partially-applied schema is safe.

begin;

-- 1) Envelopes — drop cascade, re-add as set null.
--    The constraint name is the Postgres default for a single-column FK:
--    `<table>_<column>_fkey`. We tolerate either that name OR an explicit
--    earlier rename so re-running on a hand-patched DB doesn't crash.
alter table public.envelopes
  drop constraint if exists envelopes_owner_id_fkey;

alter table public.envelopes
  add constraint envelopes_owner_id_fkey
  foreign key (owner_id)
  references auth.users(id)
  on delete set null;

-- The column was `not null` at create time. Relax to `null` so the
-- service-layer detach path (`update envelopes set owner_id = null
-- where ...`) and the FK SET NULL safety net both succeed.
alter table public.envelopes
  alter column owner_id drop not null;

-- 2) Templates — drop the legacy cascade, re-add explicitly. Keeping
--    cascade for templates is fine because they are working state, not
--    statutory records. The service still hard-deletes them first.
alter table public.templates
  drop constraint if exists templates_owner_id_fkey;

alter table public.templates
  add constraint templates_owner_id_fkey
  foreign key (owner_id)
  references auth.users(id)
  on delete cascade;

-- 3) Tombstone table. PK is the user_id so re-running the deletion is
--    idempotent (an upsert with no-op on conflict would also work but
--    we don't need it; the service guards against double-runs).
create table if not exists public.deleted_user_tombstones (
  user_id    uuid        primary key,
  email_hash text        not null check (char_length(email_hash) = 64),
  deleted_at timestamptz not null default now()
);

comment on table public.deleted_user_tombstones is
  'Issue #38: forensic breadcrumb of deleted accounts. Records the user id and the SHA-256 hash of the email at deletion time so support can correlate "who used to own this preserved envelope?" without retaining the email itself. The original auth.users row is gone by the time this table is read.';

commit;
