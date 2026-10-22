import type { Transaction } from 'kysely';
import type { Database } from '../../db/schema';

/**
 * The seam between `EnvelopesPgRepository.appendEvent` and workflow
 * automations (design doc § Shared foundations). The repository knows only
 * this interface; the automations module provides the implementation.
 *
 * - `recordTrigger` runs inside the event's transaction and inserts the
 *   pending `automation_triggers` row. It does not look up recipes and does
 *   not insert runs or jobs. Returns whether a row was written.
 * - `afterCommit` runs once that transaction has committed. It must not
 *   throw and must not be awaited by the caller: a matcher bug can never
 *   fail the signer's submit or the sealing step.
 */
export interface AutomationEventHook {
  recordTrigger(trx: Transaction<Database>, event: AutomationHookEvent): Promise<boolean>;
  afterCommit(event: AutomationHookEvent): void;
}

export interface AutomationHookEvent {
  readonly id: string;
  readonly envelope_id: string;
  readonly event_type: string;
}

export const AUTOMATION_EVENT_HOOK = Symbol('AUTOMATION_EVENT_HOOK');
