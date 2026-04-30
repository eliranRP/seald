import type { HTMLAttributes } from 'react';
import type { AddSignerContact } from '../AddSignerDropdown';

/**
 * One picked signer in the templates wizard. Mirrors the shape
 * `UploadRoute` and `UseTemplatePage` already construct so the parent
 * doesn't have to translate at the boundary. `id` is the local
 * picker-row id (stable for keying); `contactId` is `null` for a
 * fresh "guest signer" added by typing an email — known contacts carry
 * their canonical id here so downstream code can look them up.
 */
export interface SignersStepSigner {
  readonly id: string;
  readonly contactId: string | null;
  readonly name: string;
  readonly email: string;
  readonly color: string;
}

export interface SignersStepCardProps extends HTMLAttributes<HTMLDivElement> {
  /** `'new'` while authoring a brand-new template; `'using' | 'editing'`
   *  when applying a saved template — copy + subtitle adapt. */
  readonly mode: 'new' | 'using' | 'editing';
  readonly signers: ReadonlyArray<SignersStepSigner>;
  readonly contacts: ReadonlyArray<AddSignerContact>;
  /** Add a known contact (toggle if already picked). */
  readonly onPickContact: (contact: AddSignerContact) => void;
  /** Add a guest signer by name + email when the user types a fresh address. */
  readonly onCreateGuest: (name: string, email: string) => void;
  readonly onRemoveSigner: (id: string) => void;
  /** Continue button — handler fires on click; disabled until ≥ 1 signer is added. */
  readonly onContinue: () => void;
  readonly onBack: () => void;
  /** Override the primary CTA copy. Defaults to "Continue". The
   *  containing wizard chooses whether the next step is the document
   *  picker or the fields editor. */
  readonly continueLabel?: string | undefined;
  /**
   * Optional heading override. Defaults are mode-driven and template-
   * flavoured ("Who will sign this?" / "Who's signing this time?").
   * The regular signer flow (`/document/new`) supplies its own copy
   * since it isn't authoring a template.
   */
  readonly heading?: string | undefined;
  /**
   * Optional subtitle override. Defaults read as template-flow copy
   * ("Pick the people who will fill this template."); the signer
   * flow opts out by passing its own line.
   */
  readonly subtitle?: string | undefined;
}
