import type { HTMLAttributes } from 'react';

/**
 * Kit-aligned per-signer status. The dashboard receives backend
 * `SignerUiStatus` ('awaiting' | 'viewing' | 'completed' | 'declined')
 * and maps it to this narrower set before handing to SignerStack.
 *
 *  - `signed`       → signer has signed (green ring)
 *  - `pending`      → invitation sent, not yet signed (amber ring)
 *  - `awaiting-you` → sender-side flag; envelope is parked on the user
 *    themselves (indigo ring)
 *  - `declined`     → signer declined (red ring)
 *  - `draft`        → envelope not sent yet (slate ring)
 */
export type SignerStackStatus = 'signed' | 'pending' | 'awaiting-you' | 'declined' | 'draft';

export interface SignerStackEntry {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly status: SignerStackStatus;
}

export interface SignerStackProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  readonly signers: ReadonlyArray<SignerStackEntry>;
  /** Cap on visible avatars before the "+N" chip takes over. Default 4. */
  readonly maxVisible?: number | undefined;
}
