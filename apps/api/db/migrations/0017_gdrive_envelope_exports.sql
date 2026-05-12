-- 0017_gdrive_envelope_exports.sql
-- "Save envelope artifacts to Google Drive" — per-(envelope, account) record
-- of the last push: which folder it landed in and the Drive file ids of the
-- sealed + audit PDFs so a re-save into the same folder updates in place
-- (files.update, allowed under the `drive.file` scope since we created them)
-- instead of piling up duplicates.
--
-- Scoped through the envelope's owner: RLS is enabled and the owner-only
-- policy joins to envelopes.owner_id = auth.uid(). The API connects as the
-- service role (bypasses RLS) — this is defence in depth against direct
-- PostgREST access via the anon/authenticated keys, matching 0013/0015.
--
-- Cascade deletes from both parents: dropping the envelope or disconnecting
-- the Google account removes the export bookkeeping row (no orphan records,
-- no stale Drive file ids).
--
-- Rollback: DROP TABLE public.gdrive_envelope_exports;
--   No FK references this table from elsewhere, so dropping it is safe in
--   isolation. See db/migrations/down/0017_gdrive_envelope_exports_down.sql.

create table if not exists public.gdrive_envelope_exports (
  id              uuid        primary key default gen_random_uuid(),
  envelope_id     uuid        not null references public.envelopes(id) on delete cascade,
  account_id      uuid        not null references public.gdrive_accounts(id) on delete cascade,
  folder_id       text        not null,
  folder_name     text,
  sealed_file_id  text,
  audit_file_id   text,
  last_pushed_at  timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (envelope_id, account_id)
);

create index if not exists gdrive_envelope_exports_envelope_idx
  on public.gdrive_envelope_exports (envelope_id);
create index if not exists gdrive_envelope_exports_account_idx
  on public.gdrive_envelope_exports (account_id);

alter table public.gdrive_envelope_exports enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'gdrive_envelope_exports'
      and policyname = 'gdrive_envelope_exports_owner_only'
  ) then
    create policy gdrive_envelope_exports_owner_only
      on public.gdrive_envelope_exports
      using (
        exists (
          select 1 from public.envelopes e
          where e.id = gdrive_envelope_exports.envelope_id
            and e.owner_id = auth.uid()
        )
      );
  end if;
end$$;

comment on table public.gdrive_envelope_exports is
  'Bookkeeping for the "Save to Google Drive" feature: per-(envelope, account) record of the last folder + Drive file ids so re-saves update in place.';
