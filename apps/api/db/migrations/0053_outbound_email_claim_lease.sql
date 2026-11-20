-- 0053 — outbound email claim lease (OUTBOUND_EMAIL_MACHINE, docs/state-machines.md).
--
-- A claim now sets `scheduled_for` to the end of a 10-minute lease, and a
-- `sending` row whose lease ran out (its dispatcher died between claim and
-- markSent) is claimed again, or given up once its attempts are spent.
--
-- 1. The claim reads pending, failed and sending rows by `scheduled_for`:
--    one partial index covers all three (the old one covered two).
-- 2. Rows already stuck in `sending` were claimed before leases existed, so
--    their `scheduled_for` is the original due time. A row due in the last
--    hour may still be in flight during the deploy: give it a lease. An
--    older one is not mailed weeks late: it is given up.
-- Idempotent: re-running changes nothing.

create index if not exists outbound_emails_claimable_idx
  on public.outbound_emails (scheduled_for)
  where status in ('pending', 'failed', 'sending');

drop index if exists public.outbound_emails_pending_idx;

update public.outbound_emails
   set scheduled_for = now() + interval '10 minutes'
 where status = 'sending'
   and scheduled_for <= now()
   and scheduled_for > now() - interval '1 hour';

update public.outbound_emails
   set status = 'failed',
       attempts = max_attempts,
       last_error = coalesce(last_error, 'stranded_before_claim_lease')
 where status = 'sending'
   and scheduled_for <= now() - interval '1 hour';
