-- 0030 — Owner approvals and send confirmations (parity plan WP-21; MCP
-- steps 7a, 7c and the server side of 7d; docs/design/mcp-server.md
-- § Owner approval and § Fields and send).
--
-- mcp_approvals: one row per action an agent asked the owner to approve.
--   - The raw link token (32 random bytes, base64url) is never stored. It
--     is minted by the email worker at dispatch, in the same statement
--     that arms the row (`link_token_hash`), and lives only in that one
--     email (`/approve#<token>`). A null hash means no email has gone out.
--   - `previous_token_hash` is the single alias left by an owner edit
--     from Review (the immediately previous link still decides).
--     `prior_token_hashes` holds tokens an agent re-preview replaced:
--     those links show "Updated, see the newest email" and never decide.
--   - `subject_hash` is SHA-256 of canonical JSON of the displayed facts,
--     the file hashes and the field placement. A change voids the row.
--   - Decisions are conditional updates on the decision columns, so the
--     first of an email Approve, an in-app Approve and a Deny wins.
--   - At most one open row per owner, action and subject (the partial
--     unique index); an expired row is stamped `expired_at` before a new
--     one is opened.
--   - `api_key_id` and `oauth_grant_id` carry no foreign key: the rows
--     go with the owner (`owner_id` cascades from auth.users, the same
--     path that removes the key rows), and 0028's own down script must
--     still be able to drop `api_keys` on its own. Revocation keeps the
--     key row, so the id always resolves while the owner exists.
--
-- mcp_confirmations: the 10-minute token of the unattended same-turn
--   send (`envelopes_send` only). Only its SHA-256 is stored, bound to
--   the credential, the envelope and `subject_hash`.
--
-- api_keys.approval_notify: owner setting (`email` or `none`). `none`
--   skips the approval email only; the row and the in-app queue stay.
--
-- New email kinds `approval_request` and `approval_denied`, and the event
-- type `approval_decided` (appended through appendEvent, so it joins the
-- hash chain).
--
-- RLS on, no policies (the 0015 lesson). Idempotent throughout.

create table if not exists public.mcp_approvals (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users(id) on delete cascade,
  api_key_id          uuid,
  oauth_grant_id      uuid,
  action              text not null check (action ~ '^[a-z][a-z_]{2,63}$'),
  tool                text check (tool is null or char_length(tool) between 1 and 80),
  subject_key         text not null check (char_length(subject_key) between 1 and 200),
  envelope_id         uuid references public.envelopes(id) on delete set null,
  args                jsonb not null default '{}'::jsonb,
  summary             jsonb not null,
  subject_hash        text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  link_token_hash     text check (link_token_hash is null or link_token_hash ~ '^[0-9a-f]{64}$'),
  previous_token_hash text check (previous_token_hash is null or previous_token_hash ~ '^[0-9a-f]{64}$'),
  prior_token_hashes  text[] not null default '{}'::text[],
  notify              text not null default 'email' check (notify in ('email', 'none')),
  -- What the latest email offered (`link`: login-free Approve). Always
  -- recomputed at decision time; never trusted for the decision.
  approve_requires    text not null default 'session' check (approve_requires in ('link', 'session')),
  owner_edited_at     timestamptz,
  expires_at          timestamptz not null,
  approved_at         timestamptz,
  denied_at           timestamptz,
  failed_at           timestamptz,
  expired_at          timestamptz,
  completed_at        timestamptz,
  expired_reason      text check (expired_reason is null or char_length(expired_reason) <= 64),
  decided_via         text check (decided_via is null or decided_via in ('email', 'app')),
  decided_ip          text check (decided_ip is null or char_length(decided_ip) <= 64),
  decided_ua          text check (decided_ua is null or char_length(decided_ua) <= 512),
  decided_signed_in   boolean,
  result_slug         text check (result_slug is null or char_length(result_slug) <= 64),
  result              jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint mcp_approvals_credential check (api_key_id is not null or oauth_grant_id is not null),
  constraint mcp_approvals_one_decision check (approved_at is null or denied_at is null)
);

create index if not exists mcp_approvals_owner_created_idx
  on public.mcp_approvals (owner_id, created_at desc, id desc);

create index if not exists mcp_approvals_owner_pending_idx
  on public.mcp_approvals (owner_id)
  where approved_at is null and denied_at is null;

create unique index if not exists mcp_approvals_open_subject_key
  on public.mcp_approvals (owner_id, action, subject_key)
  where approved_at is null and denied_at is null and failed_at is null and expired_at is null;

create index if not exists mcp_approvals_key_open_idx
  on public.mcp_approvals (api_key_id)
  where approved_at is null and denied_at is null and failed_at is null and expired_at is null;

-- Three denials of one key within 24 hours suspend its envelopes:send.
create index if not exists mcp_approvals_key_denied_idx
  on public.mcp_approvals (api_key_id, denied_at)
  where denied_at is not null;

create unique index if not exists mcp_approvals_link_token_key
  on public.mcp_approvals (link_token_hash)
  where link_token_hash is not null;

create index if not exists mcp_approvals_previous_token_idx
  on public.mcp_approvals (previous_token_hash)
  where previous_token_hash is not null;

create index if not exists mcp_approvals_prior_tokens_idx
  on public.mcp_approvals using gin (prior_token_hashes);

alter table public.mcp_approvals enable row level security;

create table if not exists public.mcp_confirmations (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade,
  api_key_id     uuid,
  oauth_grant_id uuid,
  tool           text not null check (tool = 'envelopes_send'),
  envelope_id    uuid not null references public.envelopes(id) on delete cascade,
  subject_hash   text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  token_hash     text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at     timestamptz not null,
  consumed_at    timestamptz,
  created_at     timestamptz not null default now(),
  constraint mcp_confirmations_credential check (api_key_id is not null or oauth_grant_id is not null)
);

create unique index if not exists mcp_confirmations_token_key
  on public.mcp_confirmations (token_hash);

create index if not exists mcp_confirmations_owner_idx
  on public.mcp_confirmations (owner_id, created_at desc);

alter table public.mcp_confirmations enable row level security;

alter table public.api_keys
  add column if not exists approval_notify text not null default 'email';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'api_keys_approval_notify_check'
  ) then
    alter table public.api_keys
      add constraint api_keys_approval_notify_check check (approval_notify in ('email', 'none'));
  end if;
end $$;

alter type email_kind add value if not exists 'approval_request';
alter type email_kind add value if not exists 'approval_denied';
alter type event_type add value if not exists 'approval_decided';
