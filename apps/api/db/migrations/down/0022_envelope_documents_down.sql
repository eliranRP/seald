-- Rollback for 0022_envelope_documents.sql.
--
-- Run it only after rolling the API image back to a build without
-- multi-file envelopes. Data loss: every document after document 1 is
-- dropped, with the fields placed on it. Document 1 lives on in the
-- legacy envelopes.original_* / sealed_* columns, which the up script
-- kept in sync, so single-file envelopes are unaffected. Storage objects
-- under {envelope_id}/documents/ are not deleted here.
--
-- `document_added` events are rewritten to `pdf_uploaded` (its closest
-- pre-0022 synonym) before the enum is cloned without the new label, as
-- down/0018 does. Rewriting event_type breaks the prev_event_hash chain
-- of the affected envelopes; that is the accepted cost of rolling back
-- an audit-trail type.
--
-- Idempotent: every drop is `if exists`, and the enum clone runs only
-- while the label is still present.

begin;

drop trigger if exists envelope_fields_default_document on public.envelope_fields;
drop trigger if exists envelopes_mirror_primary_document on public.envelopes;
drop function if exists public.envelope_fields_default_document();
drop function if exists public.envelopes_mirror_primary_document();
drop function if exists public.envelope_primary_document_id(uuid);

-- Fields on documents other than document 1 cannot be represented by
-- the single-file model.
do $$
begin
  if to_regclass('public.envelope_documents') is not null then
    delete from public.envelope_fields f
     using public.envelope_documents d
     where d.id = f.document_id
       and d.ord <> 1;
  end if;
end
$$;

alter table public.envelope_fields drop constraint if exists envelope_fields_document_fk;
drop index if exists public.envelope_fields_document_idx;
alter table public.envelope_fields drop column if exists document_id;

drop table if exists public.envelope_documents;

do $$
begin
  if exists (
    select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'event_type'
       and e.enumlabel = 'document_added'
  ) then
    update public.envelope_events
       set event_type = 'pdf_uploaded'
     where event_type = 'document_added';

    create type event_type_v0021 as enum (
      'created','sent','viewed','tc_accepted',
      'esign_disclosure_acknowledged','intent_to_sign_confirmed','consent_withdrawn',
      'field_filled','signed','all_signed','sealed','declined','expired',
      'canceled','reminder_sent','session_invalidated_by_decline',
      'session_invalidated_by_cancel','job_failed','retention_deleted',
      'pdf_uploaded'
    );

    alter table public.envelope_events
      alter column event_type type event_type_v0021
      using event_type::text::event_type_v0021;

    drop type event_type;
    alter type event_type_v0021 rename to event_type;
  end if;
end
$$;

commit;
