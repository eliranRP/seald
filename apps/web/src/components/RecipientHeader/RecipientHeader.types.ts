import type { HTMLAttributes, ReactNode } from 'react';

export interface RecipientHeaderProps extends HTMLAttributes<HTMLElement> {
  readonly docTitle: string;
  readonly docId: string;
  readonly senderName?: string | undefined;
  readonly stepLabel?: string | undefined;
  readonly onExit?: (() => void) | undefined;
  readonly logo?: ReactNode | undefined;
}
