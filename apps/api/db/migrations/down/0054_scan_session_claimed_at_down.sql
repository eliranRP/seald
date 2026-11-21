-- Rollback for 0054_scan_session_claimed_at.sql: drop the claim stamp.
-- Run only together with an image whose scan-session claim does not read
-- `claimed_at`. A session left `uploading` then waits for its expiry again.
-- Idempotent.

begin;

alter table public.scan_sessions drop column if exists claimed_at;

delete from public.schema_migrations
 where filename = '0054_scan_session_claimed_at.sql';

commit;
