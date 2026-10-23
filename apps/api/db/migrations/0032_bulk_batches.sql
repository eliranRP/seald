-- 0032 — bulk send from a template (parity plan WP-36, flag `bulkSend`).
--
-- A sender uploads a CSV against a template. The upload is validated and
-- stored as a batch in `preview` (one row per CSV data row, invalid rows
-- kept with their errors so the preview can show them). Confirming moves
-- the batch to `processing` and its valid rows to `pending`; a background
-- worker then creates and sends one envelope per row.
--
-- - `bulk_batches.status`: preview -> processing -> completed, or canceled.
-- - `bulk_batch_rows.status`: invalid | pending | processing | sent |
--   failed | canceled.
-- - Idempotency per (batch, row): `unique (batch_id, row_index)`, and the
--   row records its `envelope_id` as soon as the draft exists. A worker that
--   restarts reclaims a stale `processing` row and resumes from that
--   envelope instead of creating a second one; an envelope already past
--   `draft` is never sent again.
-- - `notified_at` marks the summary email as queued (the email row carries
--   its own `bulk_complete:<batch id>` dedupe key, so a crash between the
--   two cannot send it twice).
-- - New email kind `bulk_complete`: the sender's summary when a batch ends.
-- - RLS on, no policies (the 0015 lesson). The API role bypasses RLS.
--
-- Idempotent: every statement is `if not exists`.

create table if not exists public.bulk_batches (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  template_id     uuid references public.templates(id) on delete set null,
  template_title  text not null check (char_length(template_title) between 1 and 200),
  sender_email    text not null,
  sender_name     text,
  status          text not null default 'preview'
                  check (status in ('preview', 'processing', 'completed', 'canceled')),
  filename        text check (filename is null or char_length(filename) <= 255),
  csv_sha256      text not null check (char_length(csv_sha256) = 64),
  slot_count      integer not null check (slot_count between 1 and 20),
  total_rows      integer not null check (total_rows >= 0),
  valid_rows      integer not null check (valid_rows >= 0),
  options         jsonb not null default '{}'::jsonb,
  column_errors   jsonb not null default '[]'::jsonb,
  ignored_columns jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  confirmed_at    timestamptz,
  completed_at    timestamptz,
  canceled_at     timestamptz,
  notified_at     timestamptz
);

create index if not exists bulk_batches_owner_created_idx
  on public.bulk_batches (owner_id, created_at desc);

-- The worker's claim scan and the "finished but not yet notified" sweep.
create index if not exists bulk_batches_processing_idx
  on public.bulk_batches (confirmed_at) where status = 'processing';
create index if not exists bulk_batches_unnotified_idx
  on public.bulk_batches (completed_at)
  where notified_at is null and status in ('completed', 'canceled');

create table if not exists public.bulk_batch_rows (
  id          uuid primary key default gen_random_uuid(),
  batch_id    uuid not null references public.bulk_batches(id) on delete cascade,
  row_index   integer not null check (row_index >= 1),
  status      text not null default 'pending'
              check (status in ('invalid', 'pending', 'processing', 'sent', 'failed', 'canceled')),
  recipients  jsonb not null default '[]'::jsonb,
  title       text check (title is null or char_length(title) <= 200),
  errors      jsonb not null default '[]'::jsonb,
  envelope_id uuid references public.envelopes(id) on delete set null,
  attempts    integer not null default 0 check (attempts >= 0),
  locked_at   timestamptz,
  error_code  text,
  sent_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (batch_id, row_index)
);

-- Rows the worker may claim, in batch order.
create index if not exists bulk_batch_rows_claim_idx
  on public.bulk_batch_rows (batch_id, row_index) where status in ('pending', 'processing');
-- The per-minute throttle counts recent claims.
create index if not exists bulk_batch_rows_locked_idx
  on public.bulk_batch_rows (locked_at) where locked_at is not null;

alter table public.bulk_batches enable row level security;
alter table public.bulk_batch_rows enable row level security;

alter type email_kind add value if not exists 'bulk_complete';
