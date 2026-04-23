import type { SignatureValue } from '../../../../types/sealdTypes';

export interface TypeModeProps {
  /** Called when the user commits a non-empty name. */
  readonly onCommit: (value: Extract<SignatureValue, { kind: 'typed' }>) => void;
  /** Called when the user abandons the current attempt (empty + blur/Enter). */
  readonly onCancel: () => void;
  /** Initial text (controlled rehydration after mode switch). */
  readonly initialText?: string | undefined;
}
