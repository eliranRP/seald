-- 0020 — per-envelope reminder switch + last automated reminder stamp.
--
-- reminders_enabled defaults on so existing awaiting envelopes keep the
-- daily nudge. last_reminded_at is the claim token for the 24h cadence
-- (invite time stays on access_token_sent_at, which manual reminds already
-- bump when they rotate the signing token).

begin;

alter table public.envelopes
  add column if not exists reminders_enabled boolean not null default true;

alter table public.envelope_signers
  add column if not exists last_reminded_at timestamptz;

create index if not exists envelope_signers_reminder_due_idx
  on public.envelope_signers (access_token_sent_at)
  where signed_at is null
    and declined_at is null
    and access_token_hash is not null;

commit;
