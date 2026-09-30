-- 0020 — per-envelope reminder switch + last automated reminder stamp.
--
-- New envelopes default reminders on. Envelopes already awaiting signatures
-- were sent before the sender could see the toggle, so they stay off.
-- last_reminded_at is the claim token for the 24h cadence (invite time stays
-- on access_token_sent_at, which manual reminds already bump when they
-- rotate the signing token).

begin;

alter table public.envelopes
  add column if not exists reminders_enabled boolean not null default true;

update public.envelopes
  set reminders_enabled = false
  where status = 'awaiting_others';

alter table public.envelope_signers
  add column if not exists last_reminded_at timestamptz;

create index if not exists envelope_signers_reminder_due_idx
  on public.envelope_signers (access_token_sent_at)
  where signed_at is null
    and declined_at is null
    and access_token_hash is not null;

commit;
