-- 0003_outbound_emails.sql
-- Email outbox + idempotency + webhook stub for envelopes phase 3.

create type email_kind as enum (
  'invite','reminder','completed','declined_to_sender',
  'withdrawn_to_signer','withdrawn_after_sign',
  'expired_to_sender','expired_to_signer'
);
create type email_status as enum ('pending','sending','sent','failed');

create table public.outbound_emails (
  id              uuid primary key default gen_random_uuid(),
  envelope_id     uuid references public.envelopes(id) on delete cascade,
  signer_id       uuid references public.envelope_signers(id) on delete set null,
  kind            email_kind not null,
  to_email        citext not null,
  to_name         text not null,
  payload         jsonb not null,
  status          email_status not null default 'pending',
  attempts        integer not null default 0,
  max_attempts    integer not null default 8,
  scheduled_for   timestamptz not null default now(),
  sent_at         timestamptz,
  last_error      text,
  provider_id     text,
  source_event_id uuid references public.envelope_events(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (envelope_id, signer_id, kind, source_event_id)
);

create index outbound_emails_pending_idx on public.outbound_emails (scheduled_for)
  where status in ('pending','failed');

alter table public.outbound_emails enable row level security;

-- Idempotency records for mutating endpoints
create table public.idempotency_records (
  user_id         uuid not null,
  idempotency_key text not null,
  method          text not null,
  path            text not null,
  request_hash    text not null,
  response_status integer not null,
  response_body   jsonb not null,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '24 hours'),
  primary key (user_id, idempotency_key)
);

create index idempotency_records_expires_idx on public.idempotency_records (expires_at);

alter table public.idempotency_records enable row level security;

-- Webhook events (stub; post-MVP processor)
create table public.email_webhooks (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null,
  event_type   text not null,
  provider_id  text not null,
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz
);

create index email_webhooks_provider_id_idx on public.email_webhooks (provider_id);

alter table public.email_webhooks enable row level security;
