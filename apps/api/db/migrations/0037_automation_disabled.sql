-- 0037 — workflow automations auto-disable (docs/design/workflow-automations.md, A8).
--
-- Twenty consecutive failed runs on one recipe set `enabled = false`. The
-- recipe row records why and when, so the owner can see it later and the
-- notice is traceable. `consecutive_failures` already exists (0031); the
-- re-enable path resets it.
--
-- Also adds the `automation_disabled` email kind: the owner's one notice
-- per disable, deduped on `automation_disabled:<recipe id>:<disabled_at>`.
--
-- Idempotent: columns use `add column if not exists`, the enum label uses
-- `add value if not exists`. The enum statement sits outside the
-- transaction block, as in 0028 (a new label cannot be used in the same
-- transaction, and nothing here uses it). Rollback:
-- db/migrations/down/0037_automation_disabled_down.sql.

alter table public.automations
  add column if not exists disabled_at timestamptz;

alter table public.automations
  add column if not exists disabled_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'automations_disabled_reason_chk'
       and conrelid = 'public.automations'::regclass
  ) then
    alter table public.automations
      add constraint automations_disabled_reason_chk
      check (disabled_reason is null or disabled_reason in ('consecutive_failures'));
  end if;
end
$$;

alter type email_kind add value if not exists 'automation_disabled';
