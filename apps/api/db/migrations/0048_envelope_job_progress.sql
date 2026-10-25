-- 0048 — progress for multi-step seal jobs (docs/supabase-native-architecture.md).
--
-- The Supabase edge worker runs one seal step per invocation: the runtime
-- counts CPU per worker and a whole seal does not fit. Between steps it
-- keeps what is done here (plain JSON, `SealProgress` in sealing.service.ts):
-- the parked certificate and every document already sealed.
--
-- Null for a job that has not started a step yet, and for every job the
-- in-process Docker worker runs (it keeps the progress in memory).
-- Idempotent. Rollback: db/migrations/down/0048_envelope_job_progress_down.sql.

alter table public.envelope_jobs
  add column if not exists progress jsonb;

comment on column public.envelope_jobs.progress is
  'Multi-step seal progress (SealProgress JSON); null until a step yields.';
