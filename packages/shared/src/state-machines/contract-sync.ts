import type { ApprovalStatus } from '../approvals';
import type { AutomationRunStatus } from '../automations';
import type { BulkBatchStatus, BulkRowStatus } from '../bulk-send';
import type { EnvelopeStatus, SignerUiStatus } from '../envelope-contract';
import type { McpEnvelopeAllowedAction } from '../mcp';
import type {
  APPROVAL_MACHINE,
  AUTOMATION_RUN_MACHINE,
  BULK_BATCH_MACHINE,
  BULK_ROW_MACHINE,
} from './background';
import type { ENVELOPE_MACHINE, OwnerEnvelopeAction } from './envelope';
import type { SIGNER_MACHINE } from './signer';

/**
 * Compile-time proof that each machine names exactly the states of the wire
 * contract. Adding a status to one side without the other fails typecheck.
 */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

export type EnvelopeStatesMatchContract = Assert<
  Same<(typeof ENVELOPE_MACHINE.states)[number], EnvelopeStatus>
>;
export type SignerStatesMatchContract = Assert<
  Same<(typeof SIGNER_MACHINE.states)[number], SignerUiStatus>
>;
export type BulkBatchStatesMatchContract = Assert<
  Same<(typeof BULK_BATCH_MACHINE.states)[number], BulkBatchStatus>
>;
export type BulkRowStatesMatchContract = Assert<
  Same<(typeof BULK_ROW_MACHINE.states)[number], BulkRowStatus>
>;
export type AutomationRunStatesMatchContract = Assert<
  Same<(typeof AUTOMATION_RUN_MACHINE.states)[number], AutomationRunStatus>
>;
export type ApprovalStatesMatchContract = Assert<
  Same<(typeof APPROVAL_MACHINE.states)[number], ApprovalStatus>
>;
export type McpAllowedActionsMatchMachine = Assert<
  Same<McpEnvelopeAllowedAction, OwnerEnvelopeAction>
>;
