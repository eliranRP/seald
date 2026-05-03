-- 0013_gdrive_accounts_down.sql
-- Rollback for 0013_gdrive_accounts.sql.
--
-- This file establishes the down-script naming convention for this repo
-- (`<id>_<name>_down.sql` paired with `<id>_<name>.sql`). Existing
-- migrations 0001–0012 are forward-only because they predate the
-- convention; future migrations should ship a paired _down.sql per the
-- Phase 5 manager verdict (red-flag row 5).
--
-- Safety: no FK references this table from elsewhere in WT-A scope, so
-- DROP TABLE is non-destructive to other domains. The CASCADE clause is
-- included only to preserve idempotency if a future migration adds a
-- dependent index/view; current schema needs no cascading.
--
-- Audit-trail caveat: dropping the table loses the soft-deleted-account
-- forensic history. Operators rolling this back in production must
-- export the table contents first if compliance retention applies.

drop index if exists public.gdrive_accounts_user_idx;
drop index if exists public.gdrive_accounts_user_google_uniq;
drop table if exists public.gdrive_accounts cascade;
