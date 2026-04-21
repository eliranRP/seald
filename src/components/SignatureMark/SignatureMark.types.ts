import type { HTMLAttributes } from 'react';

export type SignatureMarkTone = 'ink' | 'indigo';

export interface SignatureMarkProps extends HTMLAttributes<HTMLDivElement> {
  readonly name: string;
  readonly size?: number | undefined;
  readonly underline?: boolean | undefined;
  readonly tone?: SignatureMarkTone | undefined;
}
