-- Rollback for 0051_envelope_archive.sql: the 0050 list RPC without
-- `archived_at`, then the column. Archived envelopes show again in the tabs.

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

alter table public.envelopes drop column if exists archived_at;

notify pgrst, 'reload schema';
