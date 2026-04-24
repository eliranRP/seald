import type { HTMLAttributes } from 'react';
import type { SignerStackStatus } from '../SignerStack';

export interface SignerProgressBarEntry {
  readonly id: string;
  readonly status: SignerStackStatus;
}

export interface SignerProgressBarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  readonly signers: ReadonlyArray<SignerProgressBarEntry>;
}
