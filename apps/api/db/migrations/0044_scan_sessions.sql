-- 0044 — Scan with phone: short-lived hand-off sessions (redesign v2, WS-J).
--
-- A signed-in owner on a computer asks for a scan session and shows its
-- code as a QR. The phone opens /scan/<code> (no sign-in; the code is the
-- bearer), captures pages, builds one PDF and posts it once. The owner's
-- browser then downloads the PDF and carries on in the upload flow.
--
-- Only the SHA-256 of the code is stored, so a database read cannot be
-- turned into a working phone link. `status` moves pending -> uploading
-- -> received -> consumed; a failed upload goes back to pending. The PDF
-- sits in storage at `storage_key` until the owner downloads it (then the
-- object is removed) or the session expires (the next session the owner
-- creates purges it). RLS on, no policies (the 0015 lesson); the API role
-- bypasses RLS.
--
-- Idempotent: every statement is `if not exists`.

create table if not exists public.scan_sessions (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  code_hash    text not null check (char_length(code_hash) = 64),
  status       text not null default 'pending'
                 check (status in ('pending', 'uploading', 'received', 'consumed')),
  storage_key  text,
  page_count   integer check (page_count is null or page_count > 0),
  byte_length  integer check (byte_length is null or byte_length > 0),
  expires_at   timestamptz not null,
  received_at  timestamptz,
  created_at   timestamptz not null default now()
);

create unique index if not exists scan_sessions_code_hash_key
  on public.scan_sessions (code_hash);

create index if not exists scan_sessions_owner_expiry_idx
  on public.scan_sessions (owner_id, expires_at);

alter table public.scan_sessions enable row level security;
