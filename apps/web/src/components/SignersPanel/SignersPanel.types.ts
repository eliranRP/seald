import type { HTMLAttributes } from 'react';

export interface SignersPanelSigner {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly color: string;
}

export interface SignersPanelProps extends HTMLAttributes<HTMLElement> {
  readonly signers: ReadonlyArray<SignersPanelSigner>;
  readonly onRequestAdd?: (() => void) | undefined;
  readonly onSelectSigner?: ((id: string) => void) | undefined;
  readonly onRemoveSigner?: ((id: string) => void) | undefined;
  readonly title?: string | undefined;
  readonly addLabel?: string | undefined;
  readonly removeLabelPrefix?: string | undefined;
  /** Id of the sender's own row: it reads "You" instead of the name. */
  readonly youId?: string | undefined;
  /** Show 1, 2, 3 in front of each row (signing in order). */
  readonly showOrder?: boolean | undefined;
}
