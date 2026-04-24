-- 0004_envelope_sender.sql
-- Persist the sending user's email + display name on the envelope row at
-- `send` time. Used by the declined_to_sender email flow (SigningService
-- needs to fan a withdrawal email to the sender but cannot look up
-- auth.users at the hot path without granting broader permissions).
--
-- Nullable because draft envelopes don't have a sender yet (sender is
-- only assigned when the envelope transitions out of draft).

alter table public.envelopes
  add column sender_email text,
  add column sender_name  text;
