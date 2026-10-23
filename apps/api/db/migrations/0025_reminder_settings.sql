-- 0025 — sender-set reminder cadence per envelope (WP-09, flag customReminders).
--
-- Defaults reproduce today's behaviour: the first automated reminder goes out
-- one day after the invite, then one a day, at most 7 per signer. Existing
-- rows pick these up through the column defaults, so nothing is backfilled.
--
-- The upper bound on reminder_max is MAX_AUTOMATED_REMINDERS (7 in
-- packages/shared/src/reminders.ts). Raising that constant needs a new
-- migration that replaces this check.
--
-- Idempotent: columns use `add column if not exists`, and each check is
-- dropped before it is re-added.

begin;

alter table public.envelopes
  add column if not exists reminder_first_after_days integer not null default 1,
  add column if not exists reminder_interval_days integer not null default 1,
  add column if not exists reminder_max integer not null default 7;

alter table public.envelopes
  drop constraint if exists envelopes_reminder_first_after_days_check;
alter table public.envelopes
  add constraint envelopes_reminder_first_after_days_check
  check (reminder_first_after_days between 1 and 30);

alter table public.envelopes
  drop constraint if exists envelopes_reminder_interval_days_check;
alter table public.envelopes
  add constraint envelopes_reminder_interval_days_check
  check (reminder_interval_days between 1 and 30);

alter table public.envelopes
  drop constraint if exists envelopes_reminder_max_check;
alter table public.envelopes
  add constraint envelopes_reminder_max_check
  check (reminder_max between 1 and 7);

commit;
