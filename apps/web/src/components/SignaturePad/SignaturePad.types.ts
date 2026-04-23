import type { SignatureValue } from '../../types/sealdTypes';

export type SignaturePadMode = 'type' | 'draw' | 'upload';

export interface SignaturePadProps {
  /** Initial mode. Defaults to 'type'. */
  readonly initialMode?: SignaturePadMode | undefined;
  /** Optional pre-existing value to seed the state machine. */
  readonly initialValue?: SignatureValue | null | undefined;
  /** Called when the user commits a valid signature from any mode. */
  readonly onCommit: (value: SignatureValue) => void;
  /** Called when the user cancels an in-progress signature attempt. */
  readonly onCancel?: (() => void) | undefined;
  /** Restrict which modes are available. Defaults to all three. */
  readonly availableModes?: ReadonlyArray<SignaturePadMode> | undefined;
}
