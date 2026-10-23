-- Rollback for 0027_signer_token_dispatch.sql.
--
-- Drops the "no signer token in the outbox" constraint so pre-Insert-A
-- code (which writes `payload.sign_url`) can insert rows again. Run it
-- BEFORE rolling the API image back, or the old send/remind paths fail
-- on insert.
--
-- The scrubbed `sign_url` values cannot be restored: only their hashes
-- were ever stored anywhere else. Links already in signers' inboxes keep
-- working. Invite or reminder rows still pending at rollback have no
-- `sign_url`: pre-Insert-A code would send such an invite without a link
-- and fail such a reminder with `missing_sign_url`. Drain the queue
-- (POST /internal/cron/flush-emails) before rolling the image back.
-- Idempotent.

begin;

alter table public.outbound_emails
  drop constraint if exists outbound_emails_payload_no_signer_token;

commit;
