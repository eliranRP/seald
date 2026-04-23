-- 0001_contacts.sql
-- Creates the per-user contacts table. Scoped by owner_id -> auth.users(id).
-- Cascades on user deletion (GDPR-aligned: a user's contacts die with them).
-- RLS is enabled with no policies: the backend connects as the admin role
-- (bypasses RLS) and is the sole gate. Default-deny protects against
-- any accidental direct-client access in future.

create extension if not exists "citext";

create table public.contacts (
  id          uuid        primary key default gen_random_uuid(),
  owner_id    uuid        not null references auth.users(id) on delete cascade,
  name        text        not null check (char_length(name)  between 1 and 200),
  email       citext      not null check (char_length(email) between 3 and 320),
  color       text        not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index contacts_owner_email_uniq on public.contacts (owner_id, email);
create        index contacts_owner_idx        on public.contacts (owner_id);

alter table public.contacts enable row level security;

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();
