-- 0006_event_type_cancel.sql
-- Add 'session_invalidated_by_cancel' to the envelope event_type enum so the
-- sender-initiated /envelopes/:id/cancel flow can append per-signer audit
-- events that mirror the /sign/:id/decline path's session_invalidated_by_decline.

alter type event_type add value if not exists 'session_invalidated_by_cancel';
