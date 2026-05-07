-- Enable Row-Level Security on tables that were missing it.
-- RLS with no policies = default-deny for non-admin roles.
-- The API connects as the service role (bypasses RLS), so this is
-- purely a defense-in-depth measure against direct PostgREST access
-- via the anon/authenticated keys.
--
-- Tables fixed:
--   deleted_user_tombstones (created in 0012, RLS omitted)
--   schema_migrations       (created by migrate.sh, RLS omitted)

begin;

alter table public.deleted_user_tombstones enable row level security;
alter table public.schema_migrations enable row level security;

commit;
