-- Rollback for 0034_automation_email_copy.sql.
--
-- Drops the three email-copy tables (daily send ledger, suppression list,
-- stop tokens) and deletes any queued or sent `automation_copy` outbox rows,
-- which have no pre-0034 equivalent. Postgres cannot remove a single enum
-- label safely, so `email_kind` keeps the value `automation_copy`; that is
-- harmless with no rows of that kind and no code that writes them (same
-- caution as `signed_to_sender` in 0019). Run it only after rolling the API
-- back to a build without the email_copy action. Idempotent.

begin;

delete from public.outbound_emails
 where kind::text = 'automation_copy';

drop table if exists public.automation_copy_stop_tokens;
drop table if exists public.automation_copy_suppressions;
drop table if exists public.automation_copy_sends;

commit;
