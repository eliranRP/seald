import type { SignerUiStatus } from '../envelope-contract';
import { defineMachine } from './machine';

/**
 * A signer's progress on one envelope. Unlike the envelope, this state is
 * not a column: it is derived from timestamps on `envelope_signers`
 * (`viewed_at`, `signed_at`, `declined_at`, `delivery_status`) by
 * {@link signerStatusOf}. The machine documents which writes are legal;
 * every write guards on the same timestamps (`signed_at IS NULL AND
 * declined_at IS NULL`).
 */
export const SIGNER_MACHINE = defineMachine({
  id: 'signer',
  storedIn:
    'envelope_signers.{viewed_at, signed_at, declined_at, delivery_status} (derived by signerStatusOf)',
  description:
    'One recipient of an envelope. `bounced` is owner-facing only: signer and verify pages read it as `awaiting`.',
  states: ['awaiting', 'viewing', 'completed', 'declined', 'bounced'],
  initial: 'awaiting',
  terminal: ['completed', 'declined'],
  transitions: {
    view: {
      from: ['awaiting'],
      to: 'viewing',
      description: 'The signer opened their link (`viewed_at`).',
    },
    sign: {
      from: ['awaiting', 'viewing', 'bounced'],
      to: 'completed',
      description: 'The signer submitted every required field (`signed_at`).',
    },
    decline: {
      from: ['awaiting', 'viewing', 'bounced'],
      to: 'declined',
      description: 'The signer declined (`declined_at`); the envelope is declined too.',
    },
    bounce: {
      from: ['awaiting', 'viewing'],
      to: 'bounced',
      description: 'The mail provider reported a hard bounce (`delivery_status = bounced`).',
    },
    redeliver: {
      from: ['bounced'],
      to: 'awaiting',
      description:
        'The owner corrected the address and the invite went out again. Reads `viewing` if the signer had opened it before.',
    },
  },
});

export type SignerTransition = keyof typeof SIGNER_MACHINE.transitions;

export interface SignerProgressStamps {
  readonly viewed_at: string | Date | null;
  readonly signed_at: string | Date | null;
  readonly declined_at: string | Date | null;
  readonly delivery_status?: string | null | undefined;
}

/**
 * The single derivation of a signer's status from its stamps. Precedence:
 * declined, completed, bounced, viewing, awaiting.
 */
export function signerStatusOf(row: SignerProgressStamps): SignerUiStatus {
  if (row.declined_at !== null) return 'declined';
  if (row.signed_at !== null) return 'completed';
  if (row.delivery_status === 'bounced') return 'bounced';
  if (row.viewed_at !== null) return 'viewing';
  return 'awaiting';
}

/** Signed or declined: the signer has nothing left to do. */
export function signerHasActed(
  row: Pick<SignerProgressStamps, 'signed_at' | 'declined_at'>,
): boolean {
  return row.signed_at !== null || row.declined_at !== null;
}
