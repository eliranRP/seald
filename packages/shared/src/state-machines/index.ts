import {
  APPROVAL_MACHINE,
  AUTOMATION_RUN_MACHINE,
  BULK_BATCH_MACHINE,
  BULK_ROW_MACHINE,
  OUTBOUND_EMAIL_MACHINE,
  SCAN_SESSION_MACHINE,
} from './background';
import { ENVELOPE_MACHINE } from './envelope';
import type { MachineSummary } from './machine';
import { SEAL_JOB_MACHINE } from './seal-job';
import { SIGNER_MACHINE } from './signer';

export { defineMachine, IllegalTransitionError, toMarkdown, toMermaid } from './machine';
export type { Machine, MachineDefinition, MachineSummary, TransitionSpec } from './machine';
export { OWNER_ENVELOPE_TRANSITIONS, ownerEnvelopeActions } from './envelope';
export type { EnvelopeLifecycleAction, EnvelopeTransition, OwnerEnvelopeAction } from './envelope';
export { signerHasActed, signerStatusOf } from './signer';
export type { SignerProgressStamps, SignerTransition } from './signer';
export type { SealJobStatus, SealJobTransition } from './seal-job';
export {
  APPROVAL_MACHINE,
  AUTOMATION_RUN_MACHINE,
  BULK_BATCH_MACHINE,
  BULK_ROW_MACHINE,
  ENVELOPE_MACHINE,
  OUTBOUND_EMAIL_MACHINE,
  SCAN_SESSION_MACHINE,
  SEAL_JOB_MACHINE,
  SIGNER_MACHINE,
};

/** Every declared machine, in the order `docs/state-machines.md` lists them. */
export const STATE_MACHINES = [
  ENVELOPE_MACHINE,
  SIGNER_MACHINE,
  SEAL_JOB_MACHINE,
  OUTBOUND_EMAIL_MACHINE,
  BULK_BATCH_MACHINE,
  BULK_ROW_MACHINE,
  SCAN_SESSION_MACHINE,
  AUTOMATION_RUN_MACHINE,
  APPROVAL_MACHINE,
] as const satisfies readonly MachineSummary[];
