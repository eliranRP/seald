-- 0002_envelopes.sql
-- Envelopes + signers + fields + events + jobs for the signing flow.
-- Scoped by owner_id -> auth.users(id). RLS enabled with no policies.
-- Backend is the sole gate (admin role bypasses RLS). Default-deny.

create extension if not exists "citext";

-- Enums
create type envelope_status as enum (
  'draft','awaiting_others','sealing','completed','declined','expired','canceled'
);
create type delivery_mode as enum ('parallel','sequential');
create type signer_role as enum ('proposer','signatory','validator','witness');
create type field_kind as enum ('signature','initials','date','text','checkbox','email');
create type signature_format as enum ('drawn','typed','upload');
create type actor_kind as enum ('sender','signer','system');
create type event_type as enum (
  'created','sent','viewed','tc_accepted','field_filled',
  'signed','all_signed','sealed','declined','expired','canceled',
  'reminder_sent','session_invalidated_by_decline','job_failed','retention_deleted'
);
create type job_kind as enum ('seal','audit_only');
create type job_status as enum ('pending','running','done','failed');

-- envelopes
create table public.envelopes (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references auth.users(id) on delete cascade,
  title              text not null check (char_length(title) between 1 and 200),
  short_code         text not null unique check (char_length(short_code) = 13),
  status             envelope_status not null default 'draft',
  delivery_mode      delivery_mode   not null default 'parallel',
  original_file_path text,
  original_sha256    text check (original_sha256 is null or char_length(original_sha256) = 64),
  original_pages     integer check (original_pages is null or original_pages > 0),
  sealed_file_path   text,
  sealed_sha256      text check (sealed_sha256 is null or char_length(sealed_sha256) = 64),
  audit_file_path    text,
  tc_version         text not null,
  privacy_version    text not null,
  sent_at            timestamptz,
  completed_at       timestamptz,
  expires_at         timestamptz not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index envelopes_owner_status_updated_idx
  on public.envelopes (owner_id, status, updated_at desc);

alter table public.envelopes enable row level security;

create trigger envelopes_set_updated_at
  before update on public.envelopes
  for each row execute function public.set_updated_at();

-- envelope_signers
create table public.envelope_signers (
  id                         uuid primary key default gen_random_uuid(),
  envelope_id                uuid not null references public.envelopes(id) on delete cascade,
  contact_id                 uuid references public.contacts(id) on delete set null,
  email                      citext not null,
  name                       text not null check (char_length(name) between 1 and 200),
  color                      text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  role                       signer_role not null default 'signatory',
  signing_order              integer not null default 1 check (signing_order >= 1),

  access_token_hash          text check (access_token_hash is null or char_length(access_token_hash) = 64),
  access_token_sent_at       timestamptz,
  verification_checks        jsonb not null default '[]'::jsonb,

  viewed_at                  timestamptz,
  tc_accepted_at             timestamptz,
  signed_at                  timestamptz,
  declined_at                timestamptz,
  decline_reason             text check (decline_reason is null or char_length(decline_reason) <= 500),

  signing_ip                 inet,
  signing_user_agent         text,

  signature_format           signature_format,
  signature_image_path       text,
  signature_font             text,
  signature_stroke_count     integer,
  signature_source_filename  text,

  created_at                 timestamptz not null default now(),

  unique (envelope_id, email),
  check ((signed_at is null) or (tc_accepted_at is not null)),
  check ((signed_at is null) or (signature_format is not null)),
  check ((declined_at is null) or (signed_at is null))
);

create index envelope_signers_envelope_signed_idx on public.envelope_signers (envelope_id, signed_at);
create index envelope_signers_token_idx on public.envelope_signers (access_token_hash) where access_token_hash is not null;

alter table public.envelope_signers enable row level security;

-- envelope_fields
create table public.envelope_fields (
  id             uuid primary key default gen_random_uuid(),
  envelope_id    uuid not null references public.envelopes(id) on delete cascade,
  signer_id      uuid not null references public.envelope_signers(id) on delete cascade,
  kind           field_kind not null,
  page           integer not null check (page >= 1),
  x              numeric(7,4) not null check (x >= 0 and x <= 1),
  y              numeric(7,4) not null check (y >= 0 and y <= 1),
  width          numeric(7,4) check (width is null or (width > 0 and width <= 1)),
  height         numeric(7,4) check (height is null or (height > 0 and height <= 1)),
  required       boolean not null default true,
  link_id        text,
  value_text     text,
  value_boolean  boolean,
  filled_at      timestamptz,
  created_at     timestamptz not null default now()
);

create index envelope_fields_envelope_page_idx on public.envelope_fields (envelope_id, page);
create index envelope_fields_signer_idx on public.envelope_fields (signer_id);

alter table public.envelope_fields enable row level security;

-- envelope_events (append-only at app level)
create table public.envelope_events (
  id           uuid primary key default gen_random_uuid(),
  envelope_id  uuid not null references public.envelopes(id) on delete cascade,
  signer_id    uuid references public.envelope_signers(id) on delete set null,
  actor_kind   actor_kind not null,
  event_type   event_type not null,
  ip           inet,
  user_agent   text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index envelope_events_envelope_created_idx on public.envelope_events (envelope_id, created_at);

alter table public.envelope_events enable row level security;

-- envelope_jobs
create table public.envelope_jobs (
  id             uuid primary key default gen_random_uuid(),
  envelope_id    uuid not null unique references public.envelopes(id) on delete cascade,
  kind           job_kind not null,
  status         job_status not null default 'pending',
  attempts       integer not null default 0,
  max_attempts   integer not null default 5,
  last_error     text,
  scheduled_for  timestamptz not null default now(),
  started_at     timestamptz,
  finished_at    timestamptz,
  created_at     timestamptz not null default now()
);

create index envelope_jobs_pending_idx on public.envelope_jobs (scheduled_for)
  where status in ('pending','failed');

alter table public.envelope_jobs enable row level security;
