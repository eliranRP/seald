-- Rollback for 0017_gdrive_envelope_exports.sql.
-- DROP TABLE cascades to the RLS policy + indexes. No FK references this
-- table from elsewhere, so dropping it is safe in isolation.

begin;

drop table if exists public.gdrive_envelope_exports;

commit;
