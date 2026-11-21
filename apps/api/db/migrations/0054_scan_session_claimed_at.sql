-- 0054 — scan session claim stamp (SCAN_SESSION_MACHINE, docs/state-machines.md).
--
-- `claim` (pending -> uploading) now records when the phone's upload began.
-- A phone whose upload crashed between claim and markReceived/release used
-- to leave the session `uploading` until it expired. A claim older than
-- SCAN_UPLOAD_CLAIM_STALE_MS (2 minutes) may now be taken over by the next
-- upload, and the finishing writes (markReceived, release) re-check the
-- stamp, so a stale phone cannot overwrite the newer claim (CLAUDE.md SM.3).
--
-- Rows already `uploading` have no stamp; the claim treats a null stamp
-- as stale. Idempotent: `if not exists`.

alter table public.scan_sessions
  add column if not exists claimed_at timestamptz;
