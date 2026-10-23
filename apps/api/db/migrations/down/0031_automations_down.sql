-- Rollback for 0031_automations.sql.
--
-- Drops every automation table (recipes, secrets, triggers, runs, jobs and
-- the matcher checkpoint), the four automation enum types, and
-- envelopes.source_template_id. Recipe history and encrypted webhook
-- secrets are gone after this; there is nothing to restore them from.
-- Run it only after rolling the API image back to a build without the
-- automations module (or with `workflowAutomations` off, so appendEvent
-- does not write trigger rows). Idempotent.

begin;

drop table if exists public.automation_jobs;
drop table if exists public.automation_runs;
drop table if exists public.automation_triggers;
drop table if exists public.automation_secrets;
drop table if exists public.automation_matcher_checkpoint;
drop table if exists public.automations;

drop type if exists public.automation_run_status;
drop type if exists public.automation_action;
drop type if exists public.automation_trigger;
drop type if exists public.automation_scope;

alter table public.envelopes drop column if exists source_template_id;

commit;
