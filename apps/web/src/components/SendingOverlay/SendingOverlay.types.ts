import type { HTMLAttributes } from 'react';

/**
 * Phase broadcast by `useSendEnvelope` while the orchestration is in
 * flight. `idle` hides the overlay; `error` shows a recoverable
 * error state. Unknown phases collapse to 'creating'.
 */
export type SendingPhase =
  | 'idle'
  | 'creating'
  | 'uploading'
  | 'adding-signers'
  | 'placing-fields'
  | 'sending'
  | 'done'
  | 'error';

export interface SendingOverlaySigner {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly color?: string | undefined;
}

export interface SendingOverlayProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  readonly open: boolean;
  readonly phase: SendingPhase;
  readonly error: string | null;
  readonly signers: ReadonlyArray<SendingOverlaySigner>;
  readonly fieldCount: number;
  /** Short display id shown in the meta line (e.g. "DOC-8F3A"). */
  readonly envelopeCode?: string | undefined;
  /** Fires when the user clicks Cancel while the send is in flight. */
  readonly onCancel?: (() => void) | undefined;
  /** Fires when the user clicks View envelope after success. */
  readonly onViewEnvelope?: (() => void) | undefined;
  /** Fires when the user dismisses an error. */
  readonly onRetry?: (() => void) | undefined;
}
