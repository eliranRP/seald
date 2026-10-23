-- 0043 — Settings redesign: the sender's own preferences.
--
-- One row per user (created on first PATCH; a missing row reads as the
-- defaults). Holds the profile display name, the saved signature and
-- initials used when the sender signs their own documents, the two
-- optional notification switches, and the reminder and expiry defaults
-- that Prepare and Use template start from.
--
-- The "Completed" and "Declined, expired, bounced" notifications are not
-- columns: they are always on. Signature and initials images are PNG data
-- URLs, capped in the API. RLS on, no policies (the 0015 lesson).
-- Account deletion removes the row (`on delete cascade` from auth.users).
--
-- Idempotent: every statement is `if not exists`.

create table if not exists public.user_settings (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  display_name         text check (display_name is null or char_length(display_name) <= 120),
  signature_type       text not null default 'typed'
                         check (signature_type in ('typed', 'drawn', 'uploaded')),
  signature_text       text check (signature_text is null or char_length(signature_text) <= 80),
  signature_image      text check (signature_image is null or char_length(signature_image) <= 200000),
  initials             text check (initials is null or char_length(initials) <= 6),
  notify_signed        boolean not null default true,
  notify_daily_summary boolean not null default false,
  reminder_default     text not null default '3d'
                         check (reminder_default in ('off', '2d', '3d', 'weekly')),
  expiry_default_days  integer not null default 30
                         check (expiry_default_days in (7, 14, 30, 60)),
  updated_at           timestamptz not null default now()
);

alter table public.user_settings enable row level security;
