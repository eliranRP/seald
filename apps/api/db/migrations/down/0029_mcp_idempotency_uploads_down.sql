-- Rollback for 0029_mcp_idempotency_uploads.sql.
--
-- Drops the staged-uploads table and the two added columns. Staging
-- objects in storage (`mcp-uploads/<owner>/<id>.pdf`) are not touched by
-- SQL; they are short-lived and the bucket lifecycle (or a manual sweep)
-- removes them. MCP idempotency rows lose their completion marker, so
-- they are deleted rather than left looking complete. Run only together
-- with an image that has no MCP write tools. Idempotent.

begin;

drop table if exists public.mcp_uploads;

do $$
begin
  if to_regclass('public.envelope_documents') is not null then
    alter table public.envelope_documents
      drop constraint if exists envelope_documents_source_drive_file_name_len;
    alter table public.envelope_documents
      drop column if exists source_drive_file_name;
  end if;
end $$;

delete from public.idempotency_records where method = 'MCP';
alter table public.idempotency_records
  drop column if exists completed_at;

delete from public.schema_migrations
 where filename = '0029_mcp_idempotency_uploads.sql';

commit;
