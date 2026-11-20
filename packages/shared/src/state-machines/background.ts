import { defineMachine } from './machine';

/**
 * The smaller persisted lifecycles: queues, batches and short-lived
 * sessions. Each one lists the repository that writes it, so a reader (or
 * an agent) can go from the diagram to the SQL.
 */

/** `outbound_emails.status` (enum `email_status`), written by `outbound-emails.repository.pg.ts`. */
export const OUTBOUND_EMAIL_MACHINE = defineMachine({
  id: 'outbound_email',
  storedIn: 'outbound_emails.status',
  description:
    'One queued email. The dispatcher claims due rows (`FOR UPDATE SKIP LOCKED`, attempts < max). ' +
    '`failed` always has its attempts spent, so it is never claimed again.',
  states: ['pending', 'sending', 'sent', 'failed', 'canceled'],
  initial: 'pending',
  terminal: ['sent', 'canceled'],
  transitions: {
    claim: {
      from: ['pending', 'failed'],
      to: 'sending',
      description: 'The dispatcher claims a due row with attempts left and counts an attempt.',
    },
    sent: { from: ['sending'], to: 'sent', description: 'The provider accepted the email.' },
    retry: {
      from: ['sending'],
      to: 'pending',
      description: 'A transient send error with attempts left; rescheduled with backoff.',
    },
    give_up: {
      from: ['sending'],
      to: 'failed',
      description:
        'A permanent error, the last attempt, an unknown template or a skipped send; attempts are set to max.',
    },
    cancel: {
      from: ['pending'],
      to: 'canceled',
      description: 'An invite or your-turn email whose envelope was taken back (unsend).',
    },
  },
});

/** `bulk_batches.status`, written by `bulk.repository.pg.ts`. */
export const BULK_BATCH_MACHINE = defineMachine({
  id: 'bulk_batch',
  storedIn: 'bulk_batches.status',
  description: 'One bulk send: a CSV of recipients previewed, confirmed and worked row by row.',
  states: ['preview', 'processing', 'completed', 'canceled'],
  initial: 'preview',
  terminal: ['completed', 'canceled'],
  transitions: {
    confirm: {
      from: ['preview'],
      to: 'processing',
      description: 'The owner confirms a batch with at least one valid row.',
    },
    finish: {
      from: ['processing'],
      to: 'completed',
      description: 'No row is pending or processing any more; the summary email goes out once.',
    },
    cancel: {
      from: ['preview', 'processing'],
      to: 'canceled',
      description: 'The owner cancels; pending rows are canceled with it.',
    },
  },
  actions: {
    edit_options: { in: ['preview'], description: 'Change the batch options before confirming.' },
  },
});

/** `bulk_batch_rows.status`, written by `bulk.repository.pg.ts`. */
export const BULK_ROW_MACHINE = defineMachine({
  id: 'bulk_row',
  storedIn: 'bulk_batch_rows.status',
  description:
    'One CSV row of a bulk batch. Rows that fail validation are created `invalid` and never sent.',
  states: ['pending', 'processing', 'sent', 'failed', 'canceled', 'invalid'],
  initial: 'pending',
  entry: ['invalid'],
  terminal: ['sent', 'failed', 'canceled', 'invalid'],
  transitions: {
    claim: {
      from: ['pending', 'processing'],
      to: 'processing',
      description:
        'The bulk worker claims a pending row, or reclaims one whose lock went stale, while the batch is processing.',
    },
    sent: { from: ['processing'], to: 'sent', description: 'The envelope for the row was sent.' },
    fail: { from: ['processing'], to: 'failed', description: 'The row could not be sent.' },
    release: {
      from: ['processing'],
      to: 'pending',
      description: 'The worker hit the per-minute rate limit and hands the row back.',
    },
    cancel: { from: ['pending'], to: 'canceled', description: 'The batch was canceled.' },
  },
});

/** `scan_sessions.status` (migration 0044), written by `scan-sessions.repository.pg.ts`. */
export const SCAN_SESSION_MACHINE = defineMachine({
  id: 'scan_session',
  storedIn: 'scan_sessions.status',
  description:
    '"Scan with phone": a 10-minute hand-off from the phone to the computer. Expiry is read from `expires_at`; ' +
    'the public status reads `expired` for a consumed or timed-out session.',
  states: ['pending', 'uploading', 'received', 'consumed'],
  initial: 'pending',
  terminal: ['consumed'],
  transitions: {
    claim: {
      from: ['pending'],
      to: 'uploading',
      description: 'The phone starts its single upload (session unexpired).',
    },
    received: { from: ['uploading'], to: 'received', description: 'The PDF is stored.' },
    release: {
      from: ['uploading'],
      to: 'pending',
      description: 'The upload failed; the phone may try again.',
    },
    consume: {
      from: ['received'],
      to: 'consumed',
      description: "The owner's browser downloaded the PDF.",
    },
  },
});

/** `automation_runs.status`, written by `automations.repository.pg.ts` and `automations-crud.repository.pg.ts`. */
export const AUTOMATION_RUN_MACHINE = defineMachine({
  id: 'automation_run',
  storedIn: 'automation_runs.status',
  description: 'One delivery of a workflow automation (webhook or email copy) for one trigger.',
  states: ['queued', 'running', 'done', 'retrying', 'failed'],
  initial: 'queued',
  terminal: ['done'],
  transitions: {
    claim: {
      from: ['queued', 'retrying'],
      to: 'running',
      description: 'The automation worker claims the due job.',
    },
    complete: {
      from: ['running'],
      to: 'done',
      description: 'Delivered; the failure streak resets.',
    },
    retry: {
      from: ['running'],
      to: 'retrying',
      description: 'A retryable failure with attempts left.',
    },
    defer: {
      from: ['running'],
      to: 'queued',
      description: 'Rate or daily cap reached; tried again later without spending an attempt.',
    },
    fail: {
      from: ['running', 'queued', 'retrying'],
      to: 'failed',
      description:
        'Out of attempts or not retryable (streak +1), or parked while the recipe needs approval.',
    },
    requeue: {
      from: ['failed'],
      to: 'queued',
      description: 'The owner retries a failed, retryable run.',
    },
  },
});

/**
 * An owner approval (`mcp_approvals`). Derived from timestamps by
 * `approvalStatus` in `apps/api/src/approvals/approval-state.ts`; an
 * approved row whose action is still running reads `pending`.
 */
export const APPROVAL_MACHINE = defineMachine({
  id: 'approval',
  storedIn:
    'mcp_approvals.{approved_at, denied_at, failed_at, expired_at, completed_at, expires_at} (derived by approvalStatus)',
  description:
    'An agent action waiting for the owner. Only an open row (nothing recorded, inside its 24 hours) decides.',
  states: ['pending', 'done', 'denied', 'expired', 'failed'],
  initial: 'pending',
  terminal: ['done', 'denied', 'expired', 'failed'],
  transitions: {
    approve_and_complete: {
      from: ['pending'],
      to: 'done',
      description: 'Approved and the action finished (`completed_at`).',
    },
    deny: { from: ['pending'], to: 'denied', description: 'The owner denied it.' },
    expire: {
      from: ['pending'],
      to: 'expired',
      description:
        'Past `expires_at`, or expired because its key or grant was revoked (`expired_at`).',
    },
    fail: {
      from: ['pending'],
      to: 'failed',
      description:
        'The approved action failed, or did not finish within 10 minutes (`execution_interrupted`).',
    },
  },
});
