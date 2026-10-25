-- 0049 — pg_cron schedules for the Supabase Edge Functions
-- (docs/supabase-native-architecture.md, decision 5).
--
-- Defines the installer only. Nothing is scheduled until an operator runs,
-- at the cut-over:
--
--   select vault.create_secret('<CRON_SECRET>', 'seald_cron_secret');
--   select public.seald_install_edge_schedules('https://<ref>.supabase.co/functions/v1');
--
-- so this migration is inert on the EC2 deploy (whose in-process workers
-- still do this work) and on plain Postgres (CI), which has no pg_cron,
-- pg_net or Vault: those are resolved when the function runs, not here.
-- `seald_remove_edge_schedules()` takes them all out again.
--
-- Every job POSTs with `X-Cron-Secret`, read from Vault at call time, so
-- the secret never appears in cron.job. The workers and the bridge cron
-- endpoints are idempotent and claim with skip locked, so an overlapping
-- or retried call is harmless.
--
-- Idempotent (create or replace; the installer replaces seald-* jobs).
-- Rollback: db/migrations/down/0049_edge_schedules_down.sql.

create or replace function public.seald_install_edge_schedules(functions_url text)
returns setof text
language plpgsql
security definer
set search_path = public
as $$
declare
  base text := rtrim(functions_url, '/');
  job record;
begin
  if base !~ '^https?://' then
    raise exception 'seald_install_edge_schedules: functions_url must be http(s)';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'seald_cron_secret') then
    raise exception 'seald_install_edge_schedules: create the vault secret seald_cron_secret first';
  end if;

  for job in select jobname from cron.job where jobname like 'seald-%' loop
    perform cron.unschedule(job.jobname);
  end loop;

  for job in
    select * from (values
      -- Backstops: both workers kick themselves while work remains.
      ('seald-seal-worker', '* * * * *', '/seal-worker'),
      ('seald-email-worker', '* * * * *', '/email-worker'),
      -- Bridge (the `seald` function) cron endpoints.
      ('seald-tick', '* * * * *', '/seald/internal/cron/tick'),
      ('seald-expire', '*/15 * * * *', '/seald/internal/cron/expire'),
      ('seald-seal-sweep', '*/15 * * * *', '/seald/internal/cron/seal-sweep'),
      ('seald-step-sweep', '*/5 * * * *', '/seald/internal/cron/step-sweep'),
      ('seald-mcp-upload-sweep', '7 * * * *', '/seald/internal/cron/mcp-upload-sweep'),
      ('seald-daily', '17 3 * * *', '/seald/internal/cron/daily')
    ) as t(jobname, schedule, path)
  loop
    perform cron.schedule(
      job.jobname,
      job.schedule,
      format(
        $cmd$select net.http_post(
          url := %L,
          headers := jsonb_build_object(
            'x-cron-secret',
            (select decrypted_secret from vault.decrypted_secrets where name = 'seald_cron_secret'),
            'content-type', 'application/json'
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 10000
        )$cmd$,
        base || job.path
      )
    );
    return next job.jobname;
  end loop;
end;
$$;

create or replace function public.seald_remove_edge_schedules()
returns setof text
language plpgsql
security definer
set search_path = public
as $$
declare
  job record;
begin
  for job in select jobname from cron.job where jobname like 'seald-%' loop
    perform cron.unschedule(job.jobname);
    return next job.jobname;
  end loop;
end;
$$;

-- Operators only: the API never calls these.
revoke all on function public.seald_install_edge_schedules(text) from public;
revoke all on function public.seald_remove_edge_schedules() from public;
