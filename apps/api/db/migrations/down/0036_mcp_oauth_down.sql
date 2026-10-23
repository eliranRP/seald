-- Rollback for 0036_mcp_oauth.sql.
--
-- Drops the OAuth tables, children first. Every connected app stops
-- working and its tokens are gone: run this only together with an image
-- that has no OAuth routes (or with `mcpOauth` off). Approval rows that
-- carry an `oauth_grant_id` keep it (that column has no foreign key).
-- Idempotent.

begin;

drop table if exists public.oauth_access_tokens;
drop table if exists public.oauth_refresh_tokens;
drop table if exists public.oauth_authorization_codes;
drop table if exists public.oauth_grants;
drop table if exists public.oauth_clients;

delete from public.schema_migrations
 where filename = '0036_mcp_oauth.sql';

commit;
