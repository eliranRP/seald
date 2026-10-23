-- 0045 — Unsend (Undo after Send): an audit event type and a mail status.
--
-- 1. Event type `unsent`: the owner undid a send within the grace window.
--    It is appended through appendEvent, so it joins the prev_event_hash
--    chain (rule S.6); nothing is ever deleted.
-- 2. Email status `canceled`: an invite that was still pending when the
--    send was undone. The dispatcher only claims `pending` and `failed`
--    rows, so a canceled row is never sent.
--
-- No table changes. Idempotent: every statement is `if not exists`.

alter type event_type add value if not exists 'unsent';
alter type email_status add value if not exists 'canceled';
