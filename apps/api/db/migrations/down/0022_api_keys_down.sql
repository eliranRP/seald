-- Rollback for 0022_api_keys.sql.
--
-- Drops api_keys. The email_kind label api_key_created stays. Postgres
-- cannot drop one enum label without rewriting the type, and a migration
-- numbered after this one may have added other labels. Rows of this kind
-- are deleted first. The application no longer sends them.

begin;

delete from public.outbound_emails
 where kind::text = 'api_key_created';

drop table if exists public.api_keys;

delete from public.schema_migrations
 where filename = '0022_api_keys.sql';

commit;
