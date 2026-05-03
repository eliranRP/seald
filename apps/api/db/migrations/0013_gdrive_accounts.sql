-- 0013_gdrive_accounts.sql
-- Phase 5 (WT-A) — Google Drive integration: per-user connected accounts.
-- Stores the KMS-envelope-encrypted refresh token (red-flag row 3 — the
-- column NEVER holds plaintext) plus the metadata needed to re-mint short-
-- lived access tokens on demand.
--
-- Scoped by user_id -> auth.users(id). On user deletion we set null rather
-- than cascade so the audit trail of "this account was once linked to user
-- X" survives in the soft-deleted form. The application service explicitly
-- soft-deletes the row (`deleted_at`) on disconnect; nothing should ever
-- hard-delete from here.
--
-- Multi-account: a single user may connect multiple Google accounts. The
-- partial UNIQUE on (user_id, google_user_id) WHERE deleted_at IS NULL
-- prevents the "double-connect" race while still allowing reconnect after
-- a soft-delete (the old row is left in place for forensic continuity).
--
-- citext is already enabled by 0001_contacts.sql; the create extension
-- guard below is a no-op safety net.
--
-- Rollback: DROP TABLE public.gdrive_accounts;
--   No FKs reference this table from elsewhere in WT-A scope, so dropping
--   it is safe in isolation. WT-D adds no FK either (its conversion job
--   map is in-memory).

create extension if not exists "citext";

create table public.gdrive_accounts (
  id                          uuid        primary key default gen_random_uuid(),
  user_id                     uuid        not null references auth.users(id) on delete set null,
  google_user_id              text        not null,
  google_email                citext      not null,
  -- KMS envelope = [4-byte BE wrapped-key-len][wrapped data key][12-byte
  -- IV][16-byte GCM tag][AES-256-GCM ciphertext]. See
  -- apps/api/src/integrations/gdrive/gdrive-kms.service.ts.
  refresh_token_ciphertext    bytea       not null,
  refresh_token_kms_key_arn   text        not null,
  scope                       text        not null,
  connected_at                timestamptz not null default now(),
  last_used_at                timestamptz,
  deleted_at                  timestamptz
);

create unique index gdrive_accounts_user_google_uniq
  on public.gdrive_accounts (user_id, google_user_id)
  where deleted_at is null;
create index gdrive_accounts_user_idx on public.gdrive_accounts (user_id) where deleted_at is null;

alter table public.gdrive_accounts enable row level security;

comment on column public.gdrive_accounts.refresh_token_ciphertext is
  'KMS envelope-encrypted Google OAuth refresh token. NEVER plaintext. Layout: 4-byte BE wrapped-key-len || wrapped DEK || 12-byte IV || 16-byte GCM tag || AES-256-GCM ciphertext.';
comment on column public.gdrive_accounts.refresh_token_kms_key_arn is
  'Per-tenant CMK ARN that wraps the per-row data key. Stored alongside the ciphertext so a future key rotation can decrypt rows minted under the old ARN.';
