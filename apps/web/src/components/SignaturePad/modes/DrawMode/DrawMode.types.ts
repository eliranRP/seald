import type { SignatureValue } from '../../../../types/sealdTypes';

export interface DrawModeProps {
  readonly onCommit: (value: Extract<SignatureValue, { kind: 'drawn' }>) => void;
  readonly onCancel: () => void;
  /** Canvas logical size. Defaults to 480×180. */
  readonly width?: number | undefined;
  readonly height?: number | undefined;
}
