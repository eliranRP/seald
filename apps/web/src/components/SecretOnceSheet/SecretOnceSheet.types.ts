import type { ReactNode } from 'react';

export interface SecretOnceSheetProps {
  readonly open: boolean;
  /** Closing drops the value: the parent clears it and the sheet renders nothing. */
  readonly onClose: () => void;
  readonly title: string;
  /** The full secret. Shown only while `open`; never stored by this component. */
  readonly secret: string;
  /** Short line under the title. Must not describe how the secret is stored. */
  readonly description?: string | undefined;
  /** Extra content under the secret, such as a connect snippet. */
  readonly children?: ReactNode;
}
