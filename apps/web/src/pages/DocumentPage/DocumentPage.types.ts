import type { HTMLAttributes, ReactNode } from 'react';
import type { AddSignerContact } from '@/components/AddSignerDropdown/AddSignerDropdown.types';
import type { PlacedFieldValue } from '@/components/PlacedField/PlacedField.types';
import type { PlacePagesMode } from '@/components/PlaceOnPagesPopover/PlaceOnPagesPopover.types';
import type { FieldKind } from '@/types/sealdTypes';
import type { PDFDocumentProxy } from '@/lib/pdf';

/** A signer as seen by the DocumentPage workspace — superset of the per-component shapes. */
export interface DocumentPageSigner {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly color: string;
}

/**
 * L4 page — full "place fields" workspace. The NavBar is provided by the
 * parent `AppShell` layout; this page renders a resizable left rail (field
 * palette), a centered canvas with a page toolbar and page-thumb strip, and
 * a right rail with signer chips, a fields summary, and the send CTA.
 * Popovers for signer selection and page placement are owned internally.
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
  /**
   * Optional parsed PDF document. When supplied, the center canvas renders
   * the real PDF page at `totalPages`-indexed navigation; when absent the
   * canvas falls back to the mock paper used in Storybook and tests.
   */
  readonly pdfDoc?: PDFDocumentProxy | null | undefined;
  /**
   * True while the `pdfDoc` is still being parsed. When set, the canvas
   * displays a loading indicator instead of the mock paper so the user has
   * feedback during the multi-second parse step for large PDFs.
   */
  readonly pdfLoading?: boolean | undefined;

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
  readonly onRemoveSigner?: ((id: string) => void) | undefined;

  // Actions ---------------------------------------------------------------
  readonly onSend: () => void;
  readonly onSaveDraft?: (() => void) | undefined;
  readonly onBack?: (() => void) | undefined;
  /**
   * Persist the current placed-fields layout as a reusable template.
   * When provided, the right rail renders a "Save as template"
   * affordance below the signers/fields summary. The route wrapper
   * owns the persistence (POST /templates) — the page just surfaces
   * the trigger so the editor stays presentation-only.
   */
  readonly onSaveAsTemplate?: (() => void) | undefined;
  /**
   * Optional contextual banner above the canvas. Used when the draft
   * was started from a saved template — see TemplateModeBanner for
   * the canonical rendering. Rendered inline above the canvas;
   * presence of this slot does not change layout when omitted.
   */
  readonly banner?: ReactNode | undefined;
  /**
   * Override the right-rail send button copy + icon. Defaults stay as
   * `Send to sign`. Templates flip this to `Save as template` when the
   * sender is authoring a brand-new template (no envelope to send yet).
   */
  readonly sendLabel?: string | undefined;
  /** Override the icon shown on the send button. */
  readonly sendIconName?: 'send' | 'bookmark' | undefined;
  /**
   * When set, the right rail renders the templates flow surface
   * instead of the signing-flow Signers + Fields panels:
   *   - 'authoring' → TEMPLATE summary card + Fields-placed list,
   *                   primary CTA "Save as template" (no signers
   *                   section). Used by `mode='new'` of the templates
   *                   wizard.
   *   - 'using'     → keep Signers + Fields panels, but the primary
   *                   CTA reads "Send to sign" + the optional
   *                   secondary "Save as template" affordance is
   *                   hidden (saving back goes through the
   *                   SendConfirmDialog instead).
   */
  readonly templateMode?: 'authoring' | 'using' | undefined;
  /**
   * Display name of the template being authored / used. Drives the
   * right-rail title in template mode and the TEMPLATE summary card
   * heading. Defaults to "New template" for `templateMode='authoring'`.
   */
  readonly templateName?: string | undefined;
}

export type { PlacePagesMode };
