-- 0022 — multi-file envelopes (WP-03).
--
-- An envelope now holds one or more documents. Each document is a PDF
-- with its own original and sealed hash; every field belongs to exactly
-- one document. Multi-document sealing, downloads and /verify read this
-- table. The API that adds a second document is behind the
-- `multiDocumentEnvelopes` flag; with the flag off every envelope keeps
-- exactly one document and the API responses do not change.
--
-- Compatibility contract (why there are triggers below):
--   * The legacy columns envelopes.original_* / sealed_* stay, and they
--     always mirror document 1 (ord = 1). `/verify` links and download
--     URLs already handed out keep working, and the single-file code
--     paths (upload, seal, templates, seed scripts) keep writing only the
--     envelope row.
--   * envelopes_mirror_primary_document (AFTER INSERT/UPDATE on envelopes)
--     copies those columns into document 1, creating it when missing.
--   * envelope_fields_default_document (BEFORE INSERT on envelope_fields)
--     fills document_id with document 1 when the writer does not set it.
--     An API container still on the previous image during a rolling
--     deploy therefore keeps working against the new schema.
--
-- Ordering on prod: 0027 was applied before this file existed. The
-- runner (scripts/migrate.sh) skips filenames already in
-- schema_migrations, not ids below the highest one, so this file runs on
-- the next boot. Nothing here depends on 0023–0027.
--
-- Idempotent: every create is `if not exists` / `or replace`, the
-- backfill only inserts missing rows and only fills null document ids,
-- and `set not null` is a no-op on a column that is already not null.
-- RLS is enabled with no policies (the 0015 lesson): only the API's
-- service role reads this table.

alter type event_type add value if not exists 'document_added';

create table if not exists public.envelope_documents (
  id                 uuid primary key default gen_random_uuid(),
  envelope_id        uuid not null references public.envelopes(id) on delete cascade,
  ord                integer not null check (ord >= 1),
  title              text not null check (char_length(title) between 1 and 200),
  original_file_path text,
  original_sha256    text check (original_sha256 is null or char_length(original_sha256) = 64),
  original_pages     integer check (original_pages is null or original_pages > 0),
  sealed_file_path   text,
  sealed_sha256      text check (sealed_sha256 is null or char_length(sealed_sha256) = 64),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint envelope_documents_envelope_ord_key unique (envelope_id, ord),
  -- Target of the composite FK from envelope_fields, so a field can only
  -- point at a document of its own envelope.
  constraint envelope_documents_envelope_id_id_key unique (envelope_id, id)
);

alter table public.envelope_documents enable row level security;

drop trigger if exists envelope_documents_set_updated_at on public.envelope_documents;
create trigger envelope_documents_set_updated_at
  before update on public.envelope_documents
  for each row execute function public.set_updated_at();

-- Document 1 for every existing envelope, pointing at its current paths
-- and hashes. Drafts with no upload yet get a document with null paths.
insert into public.envelope_documents
  (envelope_id, ord, title, original_file_path, original_sha256, original_pages,
   sealed_file_path, sealed_sha256)
select e.id, 1, e.title, e.original_file_path, e.original_sha256, e.original_pages,
       e.sealed_file_path, e.sealed_sha256
  from public.envelopes e
 where not exists (
   select 1 from public.envelope_documents d where d.envelope_id = e.id
 );

alter table public.envelope_fields add column if not exists document_id uuid;

update public.envelope_fields f
   set document_id = d.id
  from public.envelope_documents d
 where d.envelope_id = f.envelope_id
   and d.ord = 1
   and f.document_id is null;

-- Only after the backfill.
alter table public.envelope_fields alter column document_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'envelope_fields_document_fk'
       and conrelid = 'public.envelope_fields'::regclass
  ) then
    alter table public.envelope_fields
      add constraint envelope_fields_document_fk
      foreign key (envelope_id, document_id)
      references public.envelope_documents (envelope_id, id)
      on delete cascade;
  end if;
end
$$;

create index if not exists envelope_fields_document_idx
  on public.envelope_fields (document_id);

-- Returns document 1 of an envelope, creating it from the envelope row
-- when the envelope has no documents yet.
create or replace function public.envelope_primary_document_id(p_envelope_id uuid)
returns uuid
language plpgsql
as $$
declare
  doc_id uuid;
begin
  select id into doc_id
    from public.envelope_documents
   where envelope_id = p_envelope_id
   order by ord
   limit 1;
  if doc_id is not null then
    return doc_id;
  end if;
  insert into public.envelope_documents
    (envelope_id, ord, title, original_file_path, original_sha256, original_pages,
     sealed_file_path, sealed_sha256)
  select e.id, 1, e.title, e.original_file_path, e.original_sha256, e.original_pages,
         e.sealed_file_path, e.sealed_sha256
    from public.envelopes e
   where e.id = p_envelope_id
  on conflict (envelope_id, ord) do nothing
  returning id into doc_id;
  if doc_id is null then
    select id into doc_id
      from public.envelope_documents
     where envelope_id = p_envelope_id
     order by ord
     limit 1;
  end if;
  return doc_id;
end
$$;

create or replace function public.envelopes_mirror_primary_document()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and new.original_file_path is not distinct from old.original_file_path
     and new.original_sha256    is not distinct from old.original_sha256
     and new.original_pages     is not distinct from old.original_pages
     and new.sealed_file_path   is not distinct from old.sealed_file_path
     and new.sealed_sha256      is not distinct from old.sealed_sha256 then
    return null;
  end if;
  perform public.envelope_primary_document_id(new.id);
  update public.envelope_documents
     set original_file_path = new.original_file_path,
         original_sha256    = new.original_sha256,
         original_pages     = new.original_pages,
         sealed_file_path   = new.sealed_file_path,
         sealed_sha256      = new.sealed_sha256
   where envelope_id = new.id
     and ord = 1
     and (original_file_path is distinct from new.original_file_path
       or original_sha256    is distinct from new.original_sha256
       or original_pages     is distinct from new.original_pages
       or sealed_file_path   is distinct from new.sealed_file_path
       or sealed_sha256      is distinct from new.sealed_sha256);
  return null;
end
$$;

drop trigger if exists envelopes_mirror_primary_document on public.envelopes;
create trigger envelopes_mirror_primary_document
  after insert or update of original_file_path, original_sha256, original_pages,
                            sealed_file_path, sealed_sha256
  on public.envelopes
  for each row execute function public.envelopes_mirror_primary_document();

create or replace function public.envelope_fields_default_document()
returns trigger
language plpgsql
as $$
begin
  if new.document_id is null then
    new.document_id := public.envelope_primary_document_id(new.envelope_id);
  end if;
  return new;
end
$$;

drop trigger if exists envelope_fields_default_document on public.envelope_fields;
create trigger envelope_fields_default_document
  before insert on public.envelope_fields
  for each row execute function public.envelope_fields_default_document();
