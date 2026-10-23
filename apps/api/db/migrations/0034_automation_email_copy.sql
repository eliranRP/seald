-- 0034 — automation email copy (docs/design/workflow-automations.md, A7).
--
-- The `email_copy` action queues one `automation_copy` outbox mail per
-- recipient. This migration lands everything it needs:
--
--   - email_kind value `automation_copy` (same pattern as 0019: added with
--     `if not exists`; the value is not used inside this file, so the
--     single-transaction runner is fine on Postgres 12+).
--   - automation_copy_sends: one row per recipient-message the owner is
--     allowed that UTC day. The 50-a-day cap counts these rows under a
--     per-owner advisory lock in the application; the primary key
--     (run_id, email) makes a worker retry of the same run a no-op, so a
--     retry never spends quota twice.
--   - automation_copy_suppressions: addresses that used the stop link.
--     Scoped to the owner: the address is removed from every recipe of that
--     owner and skipped from then on.
--   - automation_copy_stop_tokens: the stop-link tokens, stored as a
--     SHA-256 hash only (the raw token exists only in the mail being sent).
--     Single use: `used_at` is stamped when the link is spent.
--
-- RLS is enabled on every new table with no policies (the 0015 lesson).
-- Idempotent. Rollback: db/migrations/down/0034_automation_email_copy_down.sql.

alter type public.email_kind add value if not exists 'automation_copy';

create table if not exists public.automation_copy_sends (
  run_id      uuid not null references public.automation_runs(id) on delete cascade,
  email       text not null check (email = lower(email) and char_length(email) between 3 and 320),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  day         date not null,
  created_at  timestamptz not null default now(),
  primary key (run_id, email)
);

create index if not exists automation_copy_sends_owner_day_idx
  on public.automation_copy_sends (owner_id, day);

create table if not exists public.automation_copy_suppressions (
  owner_id    uuid not null references auth.users(id) on delete cascade,
  email       text not null check (email = lower(email) and char_length(email) between 3 and 320),
  created_at  timestamptz not null default now(),
  primary key (owner_id, email)
);

create table if not exists public.automation_copy_stop_tokens (
  token_hash  text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  email       text not null check (email = lower(email) and char_length(email) between 3 and 320),
  created_at  timestamptz not null default now(),
  used_at     timestamptz
);

create index if not exists automation_copy_stop_tokens_owner_email_idx
  on public.automation_copy_stop_tokens (owner_id, email);

alter table public.automation_copy_sends enable row level security;
alter table public.automation_copy_suppressions enable row level security;
alter table public.automation_copy_stop_tokens enable row level security;
