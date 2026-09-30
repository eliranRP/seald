-- 0021_gdrive_token_erasure.sql
-- Privacy: disconnect must not keep a usable Drive refresh token, and
-- deleting an account must not leave the connection row behind.
--
-- Before:
--   * user_id referenced auth.users(id) ON DELETE SET NULL (0013).
--     Removing the auth user unlinked the row instead of deleting it.
--     The column is NOT NULL, so that either blocked the auth delete
--     or — where user_id had been made nullable — left the ciphertext
--     on a row with no user.
--   * refresh_token_ciphertext and refresh_token_kms_key_arn were
--     NOT NULL, so disconnect could only set deleted_at and had to
--     keep the encrypted token.
--
-- This migration:
--   1. Deletes orphan rows whose user_id is already null.
--   2. Requires user_id, then switches the auth.users FK to
--      ON DELETE CASCADE. A direct delete of the auth user removes
--      the connection. MeService.deleteAccount also deletes the rows
--      explicitly before asking Supabase to delete the user.
--   3. Allows NULL token columns so disconnect can erase the
--      ciphertext and the CMK ARN in one update and still keep the
--      connection row (Google email, connected_at, deleted_at).
--
-- Idempotent: the delete matches zero rows on a second run, DROP
-- CONSTRAINT IF EXISTS + ADD is safe to repeat, DROP NOT NULL is a
-- no-op when the column is already nullable, and SET NOT NULL is a
-- no-op when it is already required (after the orphan delete).

delete from public.gdrive_accounts
  where user_id is null;

alter table public.gdrive_accounts
  drop constraint if exists gdrive_accounts_user_id_fkey;

alter table public.gdrive_accounts
  alter column user_id set not null;

alter table public.gdrive_accounts
  add constraint gdrive_accounts_user_id_fkey
  foreign key (user_id)
  references auth.users(id)
  on delete cascade;

alter table public.gdrive_accounts
  alter column refresh_token_ciphertext drop not null;

alter table public.gdrive_accounts
  alter column refresh_token_kms_key_arn drop not null;

comment on column public.gdrive_accounts.refresh_token_ciphertext is
  'KMS envelope-encrypted Google OAuth refresh token, or NULL after disconnect. NEVER plaintext. Layout when present: 4-byte BE wrapped-key-len || wrapped DEK || 12-byte IV || 16-byte GCM tag || AES-256-GCM ciphertext.';

comment on column public.gdrive_accounts.refresh_token_kms_key_arn is
  'CMK ARN that wrapped the per-row data key. NULL after disconnect, together with refresh_token_ciphertext. The tenant CMK itself is not deleted.';
