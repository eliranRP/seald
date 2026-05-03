-- 0014_repair_gdrive_accounts.sql
-- Phase 6 prod-bug-loop repair (2026-05-03).
--
-- Background: 0013_gdrive_accounts.sql + its paired 0013_gdrive_accounts_down.sql
-- both lived at the top level of db/migrations/, so the boot-time runner
-- (scripts/migrate.sh) glob-applied them in lex order on every container
-- start. Result: prod was left with NO gdrive_accounts table, and the
-- ledger recorded BOTH files as applied — so a plain re-run of 0013 was
-- a no-op. Flipping `feature.gdriveIntegration` ON in this state would
-- 500 every Drive request.
--
-- This migration is forward-only and idempotent:
--   1. Re-creates the gdrive_accounts table + indexes (CREATE … IF NOT EXISTS).
--   2. Removes the ghost ledger entry for the down script so a future
--      bug or human error cannot mark it "already applied" and skip
--      a real re-run.
--
-- The companion fix (PR shipping with this migration) moves
-- 0013_gdrive_accounts_down.sql into db/migrations/down/ and hardens
-- migrate.sh to refuse top-level *_down.sql files outright. The
-- regression test in apps/api/test/migrations-convention.spec.ts pins
-- the convention.

create extension if not exists "citext";

create table if not exists public.gdrive_accounts (
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

create unique index if not exists gdrive_accounts_user_google_uniq
  on public.gdrive_accounts (user_id, google_user_id)
  where deleted_at is null;
create index if not exists gdrive_accounts_user_idx
  on public.gdrive_accounts (user_id) where deleted_at is null;

alter table public.gdrive_accounts enable row level security;

comment on column public.gdrive_accounts.refresh_token_ciphertext is
  'KMS envelope-encrypted Google OAuth refresh token. NEVER plaintext. Layout: 4-byte BE wrapped-key-len || wrapped DEK || 12-byte IV || 16-byte GCM tag || AES-256-GCM ciphertext.';
comment on column public.gdrive_accounts.refresh_token_kms_key_arn is
  'Per-tenant CMK ARN that wraps the per-row data key. Stored alongside the ciphertext so a future key rotation can decrypt rows minted under the old ARN.';

-- Drop the ghost ledger entry so the down script's filename is
-- unbound from the "applied" set. The file itself has already been
-- moved to db/migrations/down/ by the same PR; this DELETE just
-- cleans up the artifact in the ledger.
delete from public.schema_migrations
  where filename = '0013_gdrive_accounts_down.sql';
