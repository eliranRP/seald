-- Rollback for 0025_reminder_settings.sql.

begin;

alter table public.envelopes drop constraint if exists envelopes_reminder_max_check;
alter table public.envelopes drop constraint if exists envelopes_reminder_interval_days_check;
alter table public.envelopes drop constraint if exists envelopes_reminder_first_after_days_check;

alter table public.envelopes
  drop column if exists reminder_max,
  drop column if exists reminder_interval_days,
  drop column if exists reminder_first_after_days;

commit;
