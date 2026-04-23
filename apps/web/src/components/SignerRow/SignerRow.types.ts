import type { HTMLAttributes, MouseEvent } from 'react';
import type { Signer } from '../../types/sealdTypes';

/** Single-row display of a signer + status. Consumer wraps in <ul>. */
export interface SignerRowProps extends HTMLAttributes<HTMLDivElement> {
  readonly signer: Signer;
  readonly showMenu?: boolean | undefined;
  readonly onMenuClick?: ((signerId: string, e: MouseEvent) => void) | undefined;
}
