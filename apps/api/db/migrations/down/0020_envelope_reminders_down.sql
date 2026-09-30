-- Rollback for 0020_envelope_reminders.sql.

begin;

drop index if exists public.envelope_signers_reminder_due_idx;

alter table public.envelope_signers drop column if exists last_reminded_at;

alter table public.envelopes drop column if exists reminders_enabled;

commit;
