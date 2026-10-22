-- 0023 — signing order (WP-05, flag signingOrder).
--
-- Recipient roles do not change: every recipient is still a signer. With
-- `envelopes.delivery_mode = 'sequential'`, signers that share a
-- `signing_order` form one step. A step is invited only once every
-- signer in the steps before it has signed. 'parallel' keeps today's
-- behaviour: every signer is invited at send.
--
-- 1. `envelope_signers.invited_at`: when this signer's step was invited.
--    Null until then, and null on drafts. Set inside the send and submit
--    transactions, so it is also the idempotency lock that makes one
--    submit, and only one, start the next step.
-- 2. Event type `step_started` (appended through appendEvent, so it joins
--    the prev_event_hash chain).
-- 3. Index (envelope_id, signing_order) for the step queries.
-- 4. Backfill: envelopes already sent keep working. Every signer of a
--    sent envelope gets invited_at from its own `sent` event, else from
--    the envelope's sent_at. Before this migration every envelope was
--    parallel, so every one of those signers was invited at send.
--
-- Idempotent: `if not exists` everywhere, and the backfill only touches
-- rows whose invited_at is still null.

alter type event_type add value if not exists 'step_started';

alter table public.envelope_signers
  add column if not exists invited_at timestamptz;

create index if not exists envelope_signers_envelope_order_idx
  on public.envelope_signers (envelope_id, signing_order);

update public.envelope_signers s
   set invited_at = coalesce(
         (select min(ev.created_at)
            from public.envelope_events ev
           where ev.envelope_id = s.envelope_id
             and ev.signer_id = s.id
             and ev.event_type = 'sent'),
         e.sent_at
       )
  from public.envelopes e
 where e.id = s.envelope_id
   and s.invited_at is null
   and e.status <> 'draft'
   and e.sent_at is not null;
