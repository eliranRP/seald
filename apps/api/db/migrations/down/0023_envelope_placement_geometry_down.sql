-- Rollback for 0023_envelope_placement_geometry.sql.
--
-- Drops the placement version and the stored page geometry. Field
-- rows are left in place; a rolled-back API seals every envelope with
-- the MediaBox math. Re-applying 0023 puts existing rows back on
-- version 1 (the column default) and clears geometry until the next
-- upload.
--
-- Deletes this file's schema_migrations row so a later up can apply
-- 0023 again.

begin;

set local lock_timeout = '5s';

alter table public.envelopes drop constraint if exists envelopes_placement_version_check;

alter table public.envelopes drop column if exists original_page_geometry;

alter table public.envelopes drop column if exists placement_version;

delete from public.schema_migrations
 where filename = '0023_envelope_placement_geometry.sql';

commit;
