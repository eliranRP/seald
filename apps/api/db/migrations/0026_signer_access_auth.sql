-- 0026 — signer access code (WP-10, flag signerAccessAuth).
--
-- The sender can require an emailed one-time code before a signer opens
-- the document (`access_auth`) and again right before the signer submits
-- (`action_auth`). SMS is deferred: `email_otp` is the only method.
--
-- 1. Enum `signer_auth_method` ('none', 'email_otp').
-- 2. `envelopes.access_auth` / `action_auth`: the envelope default,
--    'none' for every existing row.
--    `envelope_signers.access_auth` / `action_auth`: per-signer override,
--    null = inherit the envelope value. Existing signers stay null, so
--    nothing changes for envelopes already out.
-- 3. Table `signer_otp_challenges`: one row per code sent.
--    - `code_hash` is hex HMAC-SHA256 under SIGNER_OTP_KEY (a server
--      secret outside the database) over the challenge id, signer id,
--      purpose and code. The code itself is never stored. It is null
--      until the email worker mints the code at dispatch, the way signer
--      links are minted (0027).
--    - `attempts` counts wrong guesses; `locked_at` is set on the 5th.
--    - `consumed_at` is set on success (no replay); `superseded_at` when
--      a newer code for the same signer and purpose was requested.
--    - Index (signer_id, created_at) serves the cooldown and hourly cap.
--    RLS on, no policies (the 0015 lesson). The API role bypasses RLS.
-- 4. Event types `access_code_sent`, `access_code_verified`,
--    `access_code_failed` (appended through appendEvent, so they join the
--    prev_event_hash chain).
-- 5. Email kind `access_code`.
--
-- Idempotent: every statement is `if not exists` or guarded.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'signer_auth_method') then
    create type signer_auth_method as enum ('none', 'email_otp');
  end if;
end
$$;

alter table public.envelopes
  add column if not exists access_auth signer_auth_method not null default 'none',
  add column if not exists action_auth signer_auth_method not null default 'none';

alter table public.envelope_signers
  add column if not exists access_auth signer_auth_method,
  add column if not exists action_auth signer_auth_method;

create table if not exists public.signer_otp_challenges (
  id             uuid primary key default gen_random_uuid(),
  envelope_id    uuid not null references public.envelopes(id) on delete cascade,
  signer_id      uuid not null references public.envelope_signers(id) on delete cascade,
  purpose        text not null check (purpose in ('access', 'action')),
  code_hash      text check (code_hash is null or char_length(code_hash) = 64),
  attempts       integer not null default 0 check (attempts >= 0),
  expires_at     timestamptz not null,
  sent_at        timestamptz,
  consumed_at    timestamptz,
  locked_at      timestamptz,
  superseded_at  timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists signer_otp_challenges_signer_created_idx
  on public.signer_otp_challenges (signer_id, created_at desc);

alter table public.signer_otp_challenges enable row level security;

alter type event_type add value if not exists 'access_code_sent';
alter type event_type add value if not exists 'access_code_verified';
alter type event_type add value if not exists 'access_code_failed';

alter type email_kind add value if not exists 'access_code';
