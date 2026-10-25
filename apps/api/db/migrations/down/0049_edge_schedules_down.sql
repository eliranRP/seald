-- Rollback for 0049_edge_schedules.sql. Idempotent.
--
-- Takes out any seald-* pg_cron jobs the installer created (when pg_cron is
-- present), then drops both functions.

do $$
begin
  if to_regclass('cron.job') is not null then
    perform public.seald_remove_edge_schedules();
  end if;
exception when undefined_function then
  null;
end;
$$;

drop function if exists public.seald_install_edge_schedules(text);
drop function if exists public.seald_remove_edge_schedules();
