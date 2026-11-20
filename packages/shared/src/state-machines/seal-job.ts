import { defineMachine } from './machine';

/**
 * A seal or audit-only job (`envelope_jobs.status`, Postgres enum
 * `job_status`). One row per envelope (unique `envelope_id`). The worker
 * claims it, runs one or more steps (S.9) and finishes or fails it; the
 * seal sweep re-arms stuck rows.
 *
 * No state is terminal: `enqueue` re-arms any row back to `pending` (a
 * failed `seal` job replaced by an `audit_only` one, for example).
 * Every retry path also requires `attempts < max_attempts`; that numeric
 * guard lives next to the SQL, the machine only names the states.
 */
export const SEAL_JOB_MACHINE = defineMachine({
  id: 'seal_job',
  storedIn: 'envelope_jobs.status',
  description:
    'Background sealing of one envelope: PAdES seal of each document, then the audit trail.',
  states: ['pending', 'running', 'done', 'failed'],
  initial: 'pending',
  terminal: [],
  transitions: {
    claim: {
      from: ['pending', 'failed'],
      to: 'running',
      description:
        'A worker claims the oldest due row (`FOR UPDATE SKIP LOCKED`, attempts < max) and counts an attempt.',
    },
    yield: {
      from: ['running'],
      to: 'pending',
      description:
        'The edge worker finished one step and stores `progress`; the attempt is refunded.',
    },
    finish: { from: ['running'], to: 'done', description: 'Every step finished.' },
    retry: {
      from: ['running'],
      to: 'pending',
      description: 'A step threw with attempts left; rescheduled with exponential backoff.',
    },
    give_up: {
      from: ['running'],
      to: 'failed',
      description: 'A step threw on the last attempt, or a stale run had no attempts left.',
    },
    reclaim: {
      from: ['running'],
      to: 'pending',
      description: 'The seal sweep re-arms a run whose worker died (started too long ago).',
    },
    requeue: {
      from: ['failed'],
      to: 'pending',
      description: 'The seal sweep re-arms a failed job that still has attempts.',
    },
    enqueue: {
      from: ['pending', 'running', 'done', 'failed'],
      to: 'pending',
      description:
        'Insert or re-arm the row for the envelope (resets attempts, error and progress).',
    },
  },
});

export type SealJobStatus = (typeof SEAL_JOB_MACHINE.states)[number];
export type SealJobTransition = keyof typeof SEAL_JOB_MACHINE.transitions;
