-- 0033 — template direct links (parity plan WP-37, flag `directLinks`).
--
-- A template owner enables a public link bound to ONE signer slot of the
-- template. Whoever opens it enters a name and an email and gets a normal
-- signing link by email; the server creates a new envelope from the
-- template with that person in the bound slot.
--
-- - `template_direct_links`: one live row per template (partial unique
--   index). The token is 256 bits and is never stored; `token_hash` is the
--   hex SHA-256 of it and `prefix` its first characters (display only).
--   Disable/enable flips `enabled` and keeps the same URL. Rotate sets
--   `revoked_at` on the live row and inserts a new one, so the old URL
--   stops resolving at once. `signer_slot` is `TemplateLastSigner.id`
--   (a jsonb member of templates.last_signers, so no FK is possible).
--   `sender_email` is the owner's mailbox at the time the link was made;
--   the public flow has no session, and reading auth.users is privileged.
-- - `template_direct_link_claims`: one row per accepted visitor attempt.
--   It is the abuse ledger: the daily cap counts rows from the last 24
--   hours, and `(link_id, email_hash)` stops one address from being mailed
--   twice a day through the same link. `email_hash` is SHA-256 of the
--   lower-cased email, so the table holds no addresses.
-- - `envelopes.source` records how an envelope came to exist;
--   `envelopes.direct_link_id` points at the link for `direct_link`.
-- - `templates.delivery_mode` (WP-06 gap): `sequential` makes envelopes
--   made from the template sign in the order stored per slot in
--   `last_signers[].signing_order`. Read only while `signingOrder` is on.
--
-- RLS on, no policies (the 0015 lesson). Idempotent.
-- Rollback: db/migrations/down/0033_template_direct_links_down.sql.

create table if not exists public.template_direct_links (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references public.templates(id) on delete cascade,
  owner_id      uuid not null references auth.users(id) on delete cascade,
  token_hash    text not null check (char_length(token_hash) = 64),
  prefix        text not null check (char_length(prefix) between 1 and 16),
  signer_slot   text not null check (char_length(signer_slot) between 1 and 64),
  enabled       boolean not null default true,
  daily_cap     integer not null default 50 check (daily_cap between 1 and 1000),
  sender_name   text check (sender_name is null or char_length(sender_name) between 1 and 120),
  sender_email  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  revoked_at    timestamptz
);

create unique index if not exists template_direct_links_token_hash_key
  on public.template_direct_links (token_hash);

create unique index if not exists template_direct_links_live_template_idx
  on public.template_direct_links (template_id) where revoked_at is null;

create index if not exists template_direct_links_owner_idx
  on public.template_direct_links (owner_id);

alter table public.template_direct_links enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'template_direct_links_set_updated_at'
       and tgrelid = 'public.template_direct_links'::regclass
  ) then
    create trigger template_direct_links_set_updated_at
      before update on public.template_direct_links
      for each row execute function public.set_updated_at();
  end if;
end
$$;

create table if not exists public.template_direct_link_claims (
  id           uuid primary key default gen_random_uuid(),
  link_id      uuid not null references public.template_direct_links(id) on delete cascade,
  email_hash   text not null check (char_length(email_hash) = 64),
  envelope_id  uuid references public.envelopes(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists template_direct_link_claims_link_created_idx
  on public.template_direct_link_claims (link_id, created_at desc);

create index if not exists template_direct_link_claims_link_email_idx
  on public.template_direct_link_claims (link_id, email_hash, created_at desc);

alter table public.template_direct_link_claims enable row level security;

alter table public.envelopes
  add column if not exists source text not null default 'app';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'envelopes_source_chk'
       and conrelid = 'public.envelopes'::regclass
  ) then
    alter table public.envelopes
      add constraint envelopes_source_chk
      check (source in ('app', 'template', 'direct_link', 'api', 'mcp', 'bulk'));
  end if;
end
$$;

alter table public.envelopes
  add column if not exists direct_link_id uuid
    references public.template_direct_links(id) on delete set null;

create index if not exists envelopes_direct_link_idx
  on public.envelopes (direct_link_id) where direct_link_id is not null;

alter table public.templates
  add column if not exists delivery_mode delivery_mode not null default 'parallel';
