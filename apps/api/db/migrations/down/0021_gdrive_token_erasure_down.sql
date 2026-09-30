-- Rollback for 0021_gdrive_token_erasure.sql.
--
-- The token-erasure backfill is irreversible. Tokens cleared because
-- deleted_at was already set cannot be restored. Orphan rows deleted
-- in step 1 are not restored either.
--
-- Rows whose token columns are NULL are filled with empty placeholders
-- so the NOT NULL constraints can be reapplied. Empty placeholders are
-- not credentials.
--
-- Deletes this file's schema_migrations row, matching 0019, so a later
-- up can apply 0021 again. Re-applying does not bring the erased
-- tokens back.
--
-- The auth.users foreign key goes back to ON DELETE SET NULL. Roll
-- the application back in the same change, or disconnect will try to
-- write NULL into NOT NULL columns.

begin;

update public.gdrive_accounts
  set refresh_token_ciphertext = ''::bytea
  where refresh_token_ciphertext is null;

update public.gdrive_accounts
  set refresh_token_kms_key_arn = ''
  where refresh_token_kms_key_arn is null;

alter table public.gdrive_accounts
  alter column refresh_token_ciphertext set not null;

alter table public.gdrive_accounts
  alter column refresh_token_kms_key_arn set not null;

alter table public.gdrive_accounts
  drop constraint if exists gdrive_accounts_user_id_fkey;

alter table public.gdrive_accounts
  add constraint gdrive_accounts_user_id_fkey
  foreign key (user_id)
  references auth.users(id)
  on delete set null;

comment on column public.gdrive_accounts.refresh_token_ciphertext is
  'KMS envelope-encrypted Google OAuth refresh token. NEVER plaintext. Layout: 4-byte BE wrapped-key-len || wrapped DEK || 12-byte IV || 16-byte GCM tag || AES-256-GCM ciphertext.';

comment on column public.gdrive_accounts.refresh_token_kms_key_arn is
  'Per-tenant CMK ARN that wraps the per-row data key. Stored alongside the ciphertext so a future key rotation can decrypt rows minted under the old ARN.';

delete from public.schema_migrations
 where filename = '0021_gdrive_token_erasure.sql';

commit;
