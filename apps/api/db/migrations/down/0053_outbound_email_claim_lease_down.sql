-- Rollback for 0053_outbound_email_claim_lease.sql: restore the pending
-- index. Rows the up script gave up stay `failed` (it did not record their
-- earlier state), which the old claim also never picks up again.

create index if not exists outbound_emails_pending_idx
  on public.outbound_emails (scheduled_for)
  where status in ('pending', 'failed');

drop index if exists public.outbound_emails_claimable_idx;
