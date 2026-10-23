-- Rollback for 0044_scan_sessions.sql.
--
-- Drops the scan-session table. PDFs still waiting in storage
-- (`scan-sessions/<owner>/<id>.pdf`) are not touched by SQL; they live at
-- most ten minutes past creation and the bucket lifecycle (or a manual
-- sweep) removes them. Run only together with an image that has no
-- /scan-sessions routes. Idempotent.

begin;

drop table if exists public.scan_sessions;

delete from public.schema_migrations
 where filename = '0044_scan_sessions.sql';

commit;
