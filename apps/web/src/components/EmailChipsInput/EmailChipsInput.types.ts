import type { HTMLAttributes, ReactNode } from 'react';

export interface EmailChipsValue {
  /** Committed addresses, in the order they were entered. */
  readonly tokens: ReadonlyArray<string>;
  /** Text still being typed. */
  readonly draft: string;
}

export interface EmailChipsInputProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'onChange' | 'children'
> {
  readonly value: EmailChipsValue;
  readonly onChange: (next: EmailChipsValue) => void;
  /** Lower-cased emails that are already contacts; they show as duplicates. */
  readonly existingEmails: ReadonlySet<string>;
  readonly placeholder?: string | undefined;
  /** Accessible name of the text field. */
  readonly inputLabel?: string | undefined;
  readonly autoFocus?: boolean | undefined;
  /** Rendered after the chips and the field (e.g. a "Paste example" button). */
  readonly trailing?: ReactNode;
}
