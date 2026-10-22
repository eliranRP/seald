-- 0031 — workflow automations data model (docs/design/workflow-automations.md, A1).
--
-- Recipes live in `automations`. appendEvent writes one pending
-- `automation_triggers` row in the event's own transaction (only while the
-- `workflowAutomations` flag is on). The matcher runs after commit: it
-- turns a pending trigger into an `automation_runs` row (the history) and
-- an `automation_jobs` row (the work queue), then deletes the trigger. The
-- worker claims jobs with `for update skip locked`.
--
-- Also lands, so later steps need no schema change:
--   - envelopes.source_template_id (template-scoped recipes; null until the
--     use-template flow writes it).
--   - automation_secrets (A2: AES-GCM ciphertext of the webhook signing
--     secret and URL, each with its own nonce; key is AUTOMATION_SECRETS_KEY
--     in the app, never in the database).
--   - automations.consecutive_failures (A8: twenty in a row disables a recipe).
--   - automation_matcher_checkpoint: one row holding the (created_at,
--     event_id) the matcher last scanned up to. An optimization only; the
--     partial pending index finds every pending trigger.
--
-- RLS is enabled on every new table with no policies (the 0015 lesson):
-- the API role bypasses RLS and the browser cannot read these through
-- PostgREST. Idempotent: types are created only when missing, tables and
-- indexes use `if not exists`, the FK and the trigger are guarded.
-- Rollback: db/migrations/down/0031_automations_down.sql.

begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'automation_scope' and typnamespace = 'public'::regnamespace) then
    create type public.automation_scope as enum ('account', 'template');
  end if;
  if not exists (select 1 from pg_type where typname = 'automation_trigger' and typnamespace = 'public'::regnamespace) then
    create type public.automation_trigger as enum (
      'envelope_sealed',
      'signer_signed',
      'signer_declined',
      'envelope_expired',
      'envelope_viewed',
      'envelope_sent'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'automation_action' and typnamespace = 'public'::regnamespace) then
    create type public.automation_action as enum (
      'webhook',
      'gdrive_upload',
      'email_copy',
      'slack'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'automation_run_status' and typnamespace = 'public'::regnamespace) then
    create type public.automation_run_status as enum (
      'queued',
      'running',
      'done',
      'retrying',
      'failed'
    );
  end if;
end
$$;

-- Template scope needs the envelope to remember the template it came from.
alter table public.envelopes
  add column if not exists source_template_id uuid
    references public.templates(id) on delete set null;

create table if not exists public.automations (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references auth.users(id) on delete cascade,
  recipe                text not null,
  name                  text not null check (char_length(name) between 1 and 80),
  enabled               boolean not null default true,
  trigger               public.automation_trigger not null,
  action                public.automation_action not null,
  scope                 public.automation_scope not null default 'account',
  template_id           uuid references public.templates(id) on delete cascade,
  config                jsonb not null,
  consecutive_failures  integer not null default 0 check (consecutive_failures >= 0),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint automations_scope_template_chk check (
    (scope = 'account' and template_id is null)
    or (scope = 'template' and template_id is not null)
  )
);

create table if not exists public.automation_secrets (
  automation_id        uuid primary key references public.automations(id) on delete cascade,
  secret_ciphertext    bytea not null,
  secret_nonce         bytea not null,
  url_ciphertext       bytea not null,
  url_nonce            bytea not null,
  previous_ciphertext  bytea,
  previous_nonce       bytea,
  previous_retired_at  timestamptz,
  created_at           timestamptz not null default now()
);

create table if not exists public.automation_triggers (
  event_id    uuid primary key references public.envelope_events(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'matched')),
  created_at  timestamptz not null default now(),
  matched_at  timestamptz
);

create table if not exists public.automation_runs (
  id               uuid primary key default gen_random_uuid(),
  automation_id    uuid not null references public.automations(id) on delete cascade,
  owner_id         uuid not null references auth.users(id) on delete cascade,
  envelope_id      uuid references public.envelopes(id) on delete set null,
  event_id         uuid references public.envelope_events(id) on delete set null,
  signer_id        uuid,
  trigger          public.automation_trigger not null,
  action           public.automation_action not null,
  status           public.automation_run_status not null default 'queued',
  retryable        boolean not null default true,
  attempts         integer not null default 0,
  last_error       text,
  response_status  integer,
  created_at       timestamptz not null default now(),
  finished_at      timestamptz
);

create table if not exists public.automation_jobs (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid not null unique,
  automation_id  uuid not null references public.automations(id) on delete cascade,
  status         text not null default 'pending' check (status in ('pending', 'running')),
  attempts       integer not null default 0,
  max_attempts   integer not null default 8,
  scheduled_for  timestamptz not null default now(),
  locked_at      timestamptz,
  created_at     timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'automation_jobs_run_id_fkey'
       and conrelid = 'public.automation_jobs'::regclass
  ) then
    alter table public.automation_jobs
      add constraint automation_jobs_run_id_fkey
      foreign key (run_id) references public.automation_runs(id) on delete cascade;
  end if;
end
$$;

create table if not exists public.automation_matcher_checkpoint (
  id               smallint primary key default 1 check (id = 1),
  last_created_at  timestamptz not null,
  last_event_id    uuid not null,
  updated_at       timestamptz not null default now()
);

create index if not exists automations_owner_enabled_idx
  on public.automations (owner_id, enabled);
create index if not exists automation_jobs_pending_scheduled_idx
  on public.automation_jobs (scheduled_for)
  where status = 'pending';
create index if not exists automation_jobs_running_locked_idx
  on public.automation_jobs (locked_at)
  where status = 'running';
-- Pending scan in (created_at, event_id) order, so the checkpoint rescan
-- and the full pending pass are both index-only range reads.
create index if not exists automation_triggers_pending_idx
  on public.automation_triggers (created_at, event_id)
  where status = 'pending';
create index if not exists automation_runs_owner_created_idx
  on public.automation_runs (owner_id, created_at desc);
create index if not exists automation_runs_automation_created_idx
  on public.automation_runs (automation_id, created_at desc);
-- One run per recipe, envelope, trigger and signer: a duplicate event for
-- the same signer is a no-op, two signers still produce two runs.
create unique index if not exists automation_runs_dedupe_idx
  on public.automation_runs (
    automation_id,
    envelope_id,
    trigger,
    coalesce(signer_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'automations_set_updated_at'
       and tgrelid = 'public.automations'::regclass
  ) then
    create trigger automations_set_updated_at
      before update on public.automations
      for each row execute function public.set_updated_at();
  end if;
end
$$;

alter table public.automations enable row level security;
alter table public.automation_secrets enable row level security;
alter table public.automation_triggers enable row level security;
alter table public.automation_runs enable row level security;
alter table public.automation_jobs enable row level security;
alter table public.automation_matcher_checkpoint enable row level security;

commit;
