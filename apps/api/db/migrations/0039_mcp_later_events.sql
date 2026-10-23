-- 0039 — MCP "Later" list (WP-26): audit events and a mail kind for two
-- actions on an envelope that is already out for signature.
--
-- 1. Event types `signer_corrected` (the owner approved a name or email
--    fix for a signer who has not signed) and `expiry_changed` (the owner
--    approved a new expiry). Both are appended through appendEvent, so
--    they join the prev_event_hash chain (rule S.6), and both carry
--    `metadata.mcp` when an agent asked.
-- 2. Email kind `signer_corrected`: the short note to the address that
--    stops being a recipient after a fix. The re-invite to the corrected
--    address is an ordinary `invite` row.
--
-- No table changes. Idempotent: every statement is `if not exists`.

alter type event_type add value if not exists 'signer_corrected';
alter type event_type add value if not exists 'expiry_changed';

alter type email_kind add value if not exists 'signer_corrected';
