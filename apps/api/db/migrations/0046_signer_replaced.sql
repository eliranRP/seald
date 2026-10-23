-- 0046 — Envelope detail redesign: replacing a signer on a sent envelope.
--
-- Event type `signer_replaced` (the owner swapped a signer who has not
-- signed for someone else; appended through appendEvent, so it joins the
-- prev_event_hash chain, rule S.6) and email kind `signer_replaced` (the
-- note to the person who no longer needs to sign). No table changes.
-- Idempotent: every statement is `if not exists`.

alter type event_type add value if not exists 'signer_replaced';
alter type email_kind add value if not exists 'signer_replaced';
