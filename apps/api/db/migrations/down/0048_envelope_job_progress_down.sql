-- Rollback for 0048_envelope_job_progress.sql. Idempotent.
--
-- A job that was mid-way through its steps restarts from the first step on
-- the next claim; every step is idempotent.

alter table public.envelope_jobs
  drop column if exists progress;
