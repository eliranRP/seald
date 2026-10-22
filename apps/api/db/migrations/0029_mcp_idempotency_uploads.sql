-- 0029 — MCP idempotency and staged uploads (parity plan WP-19, MCP
-- steps 8a, 8b, 8d; docs/design/mcp-server.md § Rate limits, idempotency,
-- errors and § Prepare an envelope).
--
-- 8a. `idempotency_records` (0003) already has the columns the doc needs:
--   MCP rows use `method = 'MCP'`, `path = <tool name>` and the key
--   `mcp:<key_id>:<client key>`, so two API keys never share a row and a
--   key can never replay a SPA write. The one new column is
--   `completed_at`: a row is claimed (null) before the tool runs and
--   completed with the stored response afterwards, so a concurrent call
--   with the same key sees "in progress" instead of running twice.
--   Existing rows (none are written today) are marked complete.
--
-- 8b. `mcp_uploads`, as written in the doc, plus the columns the upload
--   and Drive-import paths need: the display `filename`, `page_count`
--   (set on complete), `source` (`upload` or `gdrive`), the Drive file id
--   and name of an import, and the conversion job id a poll looks up.
--   `id` is both `document_id` and `upload_id`. `mime`, `sha256`,
--   `byte_length` and `page_count` stay null until complete; `consumed_at`
--   is set only when a completed upload is attached to a draft.
--   RLS on, no policies (the 0015 lesson). The API role bypasses RLS.
--
-- 8d. `envelope_documents.source_drive_file_name`: the name of the Drive
--   file a document was imported from, written when a Drive-sourced
--   upload is attached. `envelopes_search` filters on it (substring,
--   case-insensitive). It sits on the document, not the envelope, because
--   one envelope can hold several imported files (WP-03).
--
-- Idempotent: every statement is `if not exists` or guarded.

alter table public.idempotency_records
  add column if not exists completed_at timestamptz;

update public.idempotency_records
   set completed_at = created_at
 where completed_at is null
   and method <> 'MCP';

create table if not exists public.mcp_uploads (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users(id) on delete cascade,
  storage_key       text not null,
  filename          text check (filename is null or char_length(filename) between 1 and 255),
  mime              text,
  sha256            text check (sha256 is null or char_length(sha256) = 64),
  byte_length       integer check (byte_length is null or byte_length > 0),
  page_count        integer check (page_count is null or page_count > 0),
  thumbnail_url     text,
  source            text not null default 'upload' check (source in ('upload', 'gdrive')),
  drive_file_id     text check (drive_file_id is null or char_length(drive_file_id) <= 256),
  drive_file_name   text check (drive_file_name is null or char_length(drive_file_name) <= 1024),
  conversion_job_id uuid,
  expires_at        timestamptz not null,
  completed_at      timestamptz,
  consumed_at       timestamptz,
  created_at        timestamptz not null default now()
);

-- The daily document cap counts an owner's completed uploads per UTC day.
create index if not exists mcp_uploads_owner_completed_idx
  on public.mcp_uploads (owner_id, completed_at);

-- The cleanup pass: expired rows that were never attached.
create index if not exists mcp_uploads_unattached_expiry_idx
  on public.mcp_uploads (expires_at) where consumed_at is null;

-- `gdrive_conversion_status` looks a pending import up by its job.
create unique index if not exists mcp_uploads_owner_job_key
  on public.mcp_uploads (owner_id, conversion_job_id) where conversion_job_id is not null;

alter table public.mcp_uploads enable row level security;

-- Guarded on the table: a database that recorded later ids before 0022
-- (see envelope-documents.pg.e2e-spec) still boots. 0022 precedes 0029
-- in lex order, so on every normal boot the table exists here.
do $$
begin
  if to_regclass('public.envelope_documents') is null then
    return;
  end if;
  alter table public.envelope_documents
    add column if not exists source_drive_file_name text;
  if not exists (
    select 1 from pg_constraint
     where conname = 'envelope_documents_source_drive_file_name_len'
  ) then
    alter table public.envelope_documents
      add constraint envelope_documents_source_drive_file_name_len
      check (source_drive_file_name is null or char_length(source_drive_file_name) <= 1024);
  end if;
end $$;
