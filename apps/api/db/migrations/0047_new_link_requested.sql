-- 0047 — signer "Ask for a new link" (docs: plan/07-signer.md).
--
-- Adds the `new_link_requested` email kind: the notice to the sender when a
-- signer whose link expired asks for a new one. One per signer per UTC day,
-- deduped on `new_link_requested:<signer id>:<yyyy-mm-dd>`, so no table is
-- needed for the rate limit.
--
-- Idempotent: `add value if not exists`. Rollback:
-- db/migrations/down/0047_new_link_requested_down.sql.

alter type email_kind add value if not exists 'new_link_requested';
