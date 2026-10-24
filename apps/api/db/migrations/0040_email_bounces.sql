-- 0040 — Emails redesign: bounced delivery, your_turn, bounced_to_sender.
--
-- A hard bounce reported by the email provider (Resend `email.bounced`)
-- marks the signer's delivery as bounced so the sender can fix the address.
--
--   envelope_signers.delivery_status  'delivered' (default) | 'bounced'
--   envelope_signers.bounced_at       when the bounce was recorded
--   envelope_signers.bounce_reason    provider message, truncated by the app
--
-- New email kinds: `your_turn` (the next signer of an ordered envelope is
-- up) and `bounced_to_sender` (tells the sender an address bounced). New
-- event type `email_bounced`, appended through appendEvent so it joins the
-- prev_event_hash chain (rule S.6).
--
-- Idempotent: every statement is `if not exists`. Rollback:
-- db/migrations/down/0040_email_bounces_down.sql.

alter table public.envelope_signers
  add column if not exists delivery_status text not null default 'delivered',
  add column if not exists bounced_at timestamptz,
  add column if not exists bounce_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'envelope_signers_delivery_status_check'
  ) then
    alter table public.envelope_signers
      add constraint envelope_signers_delivery_status_check
      check (delivery_status in ('delivered', 'bounced'));
  end if;
end
$$;

alter type email_kind add value if not exists 'your_turn';
alter type email_kind add value if not exists 'bounced_to_sender';
alter type event_type add value if not exists 'email_bounced';
