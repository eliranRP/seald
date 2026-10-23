-- Rollback for 0043_user_settings.sql.
--
-- Drops the table and with it every saved profile name, signature,
-- notification switch and default. Run it only after rolling the API image
-- back to a build without `/me/settings`.
-- Idempotent.

begin;

drop table if exists public.user_settings;

delete from public.schema_migrations
 where filename = '0043_user_settings.sql';

commit;
