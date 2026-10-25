-- 0050 — owner list reads as RPCs (docs/supabase-native-architecture.md,
-- step 4).
--
-- The SPA reads the signed-in owner's lists straight from Postgres with
-- supabase-js (`supabase.rpc(...)`) instead of through the API, so the
-- dashboard, contacts and templates screens cost no function CPU. Behind
-- the `ownerReadRpcs` flag; with it off nothing calls these.
--
-- Each function is `security definer` and filters on `auth.uid()` itself.
-- The tables stay closed to the Data API (RLS on, no policies), because a
-- row policy would expose every column: signer rows carry token hashes,
-- IPs and image paths, templates carry storage paths. The functions return
-- exactly the JSON the matching API route returns, so the SPA keeps one
-- mapping:
--
--   seald_list_envelopes(p_limit)  GET /envelopes?limit=&sort=date&dir=desc
--   seald_list_contacts()          GET /contacts
--   seald_list_templates()         GET /templates
--
-- Anonymous callers (auth.uid() is null) get empty lists. Execute is
-- granted to `authenticated` only, where that role exists (Supabase); on
-- plain Postgres (CI) the functions exist but nothing can call them.
--
-- Idempotent (create or replace). Rollback:
-- db/migrations/down/0050_owner_read_rpcs_down.sql.

-- ISO-8601 in UTC with milliseconds, as JavaScript's toISOString() writes
-- it, so timestamps match the API's byte for byte.
create or replace function public.seald_iso(t timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

create or replace function public.seald_list_envelopes(p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  lim integer := least(greatest(coalesce(p_limit, 100), 1), 100);
  page jsonb;
  more boolean;
  last_row record;
begin
  if uid is null then
    return jsonb_build_object('items', '[]'::jsonb, 'next_cursor', null);
  end if;

  with picked as (
    select e.*
    from public.envelopes e
    where e.owner_id = uid
    order by e.updated_at desc, e.id asc
    limit lim + 1
  ),
  numbered as (
    select p.*, row_number() over (order by p.updated_at desc, p.id asc) as rn
    from picked p
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', n.id,
          'title', n.title,
          'short_code', n.short_code,
          'status', n.status,
          'original_pages', n.original_pages,
          'sent_at', public.seald_iso(n.sent_at),
          'completed_at', public.seald_iso(n.completed_at),
          'expires_at', public.seald_iso(n.expires_at),
          'tags', coalesce(n.tags, '[]'::jsonb),
          'created_at', public.seald_iso(n.created_at),
          'updated_at', public.seald_iso(n.updated_at),
          'signers', coalesce(
            (
              select jsonb_agg(
                jsonb_build_object(
                  'id', s.id,
                  'name', s.name,
                  'email', s.email,
                  'color', s.color,
                  'status', case
                    when s.declined_at is not null then 'declined'
                    when s.signed_at is not null then 'completed'
                    when s.delivery_status = 'bounced' then 'bounced'
                    when s.viewed_at is not null then 'viewing'
                    else 'awaiting'
                  end,
                  'signed_at', public.seald_iso(s.signed_at),
                  'delivery_status', s.delivery_status
                )
                order by s.signing_order, s.created_at, s.id
              )
              from public.envelope_signers s
              where s.envelope_id = n.id
            ),
            '[]'::jsonb
          )
        )
        order by n.rn
      ) filter (where n.rn <= lim),
      '[]'::jsonb
    ),
    count(*) > lim
  into page, more
  from numbered n;

  if not more then
    return jsonb_build_object('items', page, 'next_cursor', null);
  end if;

  -- Same keyset cursor as the API (list-cursor.ts): base64 of
  -- "<sort value>\x1f<updated_at>\x1f<id>", for the last returned row.
  select e.updated_at, e.id into last_row
  from public.envelopes e
  where e.owner_id = uid
  order by e.updated_at desc, e.id asc
  offset lim - 1
  limit 1;

  return jsonb_build_object(
    'items', page,
    'next_cursor', replace(
      encode(
        convert_to(
          public.seald_iso(last_row.updated_at) || chr(31)
            || public.seald_iso(last_row.updated_at) || chr(31)
            || last_row.id::text,
          'UTF8'
        ),
        'base64'
      ),
      e'\n',
      ''
    )
  );
end
$$;

create or replace function public.seald_list_contacts()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with stats as (
    -- Per signer email: how many sent envelopes list it and the latest
    -- send, matched case-insensitively (a signer need not be a contact).
    select lower(s.email::text) as email,
           count(distinct e.id) as docs_count,
           max(e.sent_at) as last_sent_at
    from public.envelope_signers s
    join public.envelopes e on e.id = s.envelope_id
    where e.owner_id = auth.uid()
      and e.sent_at is not null
    group by lower(s.email::text)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'owner_id', c.owner_id,
        'name', c.name,
        'email', c.email,
        'color', c.color,
        'created_at', public.seald_iso(c.created_at),
        'updated_at', public.seald_iso(c.updated_at),
        'docs_count', coalesce(st.docs_count, 0),
        'last_sent_at', public.seald_iso(st.last_sent_at)
      )
      order by c.created_at desc, c.id
    ),
    '[]'::jsonb
  )
  from public.contacts c
  left join stats st on st.email = lower(c.email::text)
  where c.owner_id = auth.uid()
    and c.deleted_at is null
$$;

create or replace function public.seald_list_templates()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'owner_id', t.owner_id,
        'title', t.title,
        'description', t.description,
        'cover_color', t.cover_color,
        'field_layout', t.field_layout,
        'tags', coalesce(t.tags, '[]'::jsonb),
        'last_signers', coalesce(t.last_signers, '[]'::jsonb),
        'delivery_mode', t.delivery_mode,
        -- The storage path stays internal, as in the API.
        'has_example_pdf', t.example_pdf_path is not null,
        'uses_count', t.uses_count,
        'last_used_at', public.seald_iso(t.last_used_at),
        'created_at', public.seald_iso(t.created_at),
        'updated_at', public.seald_iso(t.updated_at)
      )
      order by t.last_used_at desc nulls last, t.created_at desc, t.id
    ),
    '[]'::jsonb
  )
  from public.templates t
  where t.owner_id = auth.uid()
    and t.deleted_at is null
$$;

revoke execute on function public.seald_iso(timestamptz) from public;
revoke execute on function public.seald_list_envelopes(integer) from public;
revoke execute on function public.seald_list_contacts() from public;
revoke execute on function public.seald_list_templates() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.seald_iso(timestamptz) from anon;
    revoke execute on function public.seald_list_envelopes(integer) from anon;
    revoke execute on function public.seald_list_contacts() from anon;
    revoke execute on function public.seald_list_templates() from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.seald_iso(timestamptz) from authenticated;
    grant execute on function public.seald_list_envelopes(integer) to authenticated;
    grant execute on function public.seald_list_contacts() to authenticated;
    grant execute on function public.seald_list_templates() to authenticated;
  end if;
end
$$;

-- PostgREST picks up the new functions without a restart.
notify pgrst, 'reload schema';
