-- Rollback for 0050_owner_read_rpcs.sql. Turn `ownerReadRpcs` off first:
-- with these gone the SPA's RPC reads fail.

drop function if exists public.seald_list_templates();
drop function if exists public.seald_list_contacts();
drop function if exists public.seald_list_envelopes(integer);
drop function if exists public.seald_iso(timestamptz);

notify pgrst, 'reload schema';
