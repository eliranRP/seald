import type { HTMLAttributes } from 'react';
import type { NavBarUser } from '../../components/NavBar/NavBar.types';
import type { AddSignerContact } from '../../components/AddSignerDropdown/AddSignerDropdown.types';
import type { PlacedFieldValue } from '../../components/PlacedField/PlacedField.types';
import type { PlacePagesMode } from '../../components/PlaceOnPagesPopover/PlaceOnPagesPopover.types';
import type { FieldKind } from '../../types/sealdTypes';

/** A signer as seen by the DocumentPage workspace — superset of the per-component shapes. */
export interface DocumentPageSigner {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly color: string;
}

/**
 * L4 page — full "place fields" workspace. Composes the NavBar + SideBar chrome,
 * a resizable left rail (field palette), a centered canvas with a page toolbar
 * and page-thumb strip, and a right rail with signer chips, a fields summary,
 * and the send CTA. Popovers for signer selection and page placement are
 * owned internally.
 *
 * State model: the page is **fields-controlled**. Callers hold the
 * `fields` list and receive a replacement list via `onFieldsChange` on every
 * placement, move, removal, signer update, or multi-page duplication. UI-only
 * state (current page, rail widths, selection, popover open state) lives here.
 */
export interface DocumentPageProps extends HTMLAttributes<HTMLDivElement> {
  // Document --------------------------------------------------------------
  readonly totalPages: number;
  readonly title?: string | undefined;
  readonly docId?: string | undefined;
  readonly initialPage?: number | undefined;

  // Fields ----------------------------------------------------------------
  readonly fields: ReadonlyArray<PlacedFieldValue>;
  readonly onFieldsChange: (next: ReadonlyArray<PlacedFieldValue>) => void;
  readonly availableFieldKinds?: ReadonlyArray<FieldKind> | undefined;
  readonly requiredFieldKinds?: ReadonlyArray<FieldKind> | undefined;

  // Signers / contacts ----------------------------------------------------
  readonly signers: ReadonlyArray<DocumentPageSigner>;
  readonly contacts?: ReadonlyArray<AddSignerContact> | undefined;
  readonly onAddSignerFromContact?: ((contact: AddSignerContact) => void) | undefined;
  readonly onCreateSigner?: ((name: string, email: string) => void) | undefined;

  // Actions ---------------------------------------------------------------
  readonly onSend: () => void;
  readonly onSaveDraft?: (() => void) | undefined;
  readonly onBack?: (() => void) | undefined;

  // Chrome ----------------------------------------------------------------
  readonly user?: NavBarUser | undefined;
  readonly onLogoClick?: (() => void) | undefined;
  readonly onSelectNavItem?: ((id: string) => void) | undefined;
  readonly activeNavId?: string | undefined;
}

export type { PlacePagesMode };
