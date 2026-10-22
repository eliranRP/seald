-- 0027 — MCP Insert A: signer tokens are minted at dispatch.
--
-- Before this migration, invite and manual-reminder rows stored the
-- plaintext signing link (`payload.sign_url = …/sign/<id>?t=<token>`) in
-- the outbox, so a database dump leaked live signing links. From now on
-- an outbound payload holds the signer id only. EmailDispatcherService
-- mints a fresh token for each send attempt, stores only its SHA-256 on
-- envelope_signers.access_token_hash, and renders the link into that one
-- message. A null hash means the link has not been sent yet.
--
-- 1. Scrub every stored link, whatever the row status:
--    - sent rows: the link in the recipient's inbox keeps working, because
--      the signer's hash is untouched. Only the plaintext copy goes.
--    - pending / failed rows: the dispatcher mints a new token when it
--      sends them, which invalidates any earlier copy of the same link.
-- 2. Forbid it from coming back: a check constraint rejects any payload
--    with a `sign_url` key or a `?t=` / `&t=` query parameter.
--
-- Idempotent: the scrub only touches rows that still have the key, and
-- the constraint is added only when it is missing. The down script
-- cannot put the scrubbed tokens back (only their hashes ever existed
-- anywhere else).

begin;

update public.outbound_emails
  set payload = payload - 'sign_url'
  where payload ? 'sign_url';

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'outbound_emails_payload_no_signer_token'
       and conrelid = 'public.outbound_emails'::regclass
  ) then
    alter table public.outbound_emails
      add constraint outbound_emails_payload_no_signer_token
      check (
        not (payload ? 'sign_url')
        and payload::text !~ '[?&]t=[A-Za-z0-9_-]'
      ) not valid;
  end if;
  -- New rows are checked from here on. Validate the existing ones too, but
  -- do not fail the container boot over an unexpected legacy row: log it
  -- and leave the constraint NOT VALID for an operator to inspect.
  begin
    alter table public.outbound_emails
      validate constraint outbound_emails_payload_no_signer_token;
  exception when check_violation then
    raise warning '0027: outbound_emails has legacy rows with a signer token outside sign_url; constraint left NOT VALID';
  end;
end
$$;

commit;
