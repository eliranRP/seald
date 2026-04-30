import type { PlacedFieldValue } from '@/components/PlacedField/PlacedField.types';

/**
 * Domain types that a real server would return. Kept in the mock API package
 * so data files (contacts, documents, user) can reference them without
 * cycling through the provider. The provider re-exports them for consumers
 * that treat the app state as the source of truth.
 */

export type DocumentStatus =
  | 'draft'
  | 'awaiting-you'
  | 'awaiting-others'
  | 'completed'
  | 'declined';

export interface DocumentSigner {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly color: string;
}

export interface AppDocument {
  readonly id: string;
  readonly title: string;
  /** Short display identifier shown alongside the title (e.g. `DOC-8F3A`). */
  readonly code: string;
  readonly status: DocumentStatus;
  readonly fields: ReadonlyArray<PlacedFieldValue>;
  readonly signers: ReadonlyArray<DocumentSigner>;
  /** ISO string — the date the document was last updated / sent. */
  readonly updatedAt: string;
  /** Raw uploaded File — null for seeded demo documents that were never uploaded. */
  readonly file: File | null;
  /** Estimated / mocked page count. Comes from the parsed PDF when `file` is set. */
  readonly totalPages: number;
  /**
   * When the draft was started from a saved template, the source template
   * id is captured so the editor can:
   *   - render the contextual TemplateModeBanner,
   *   - prompt with SendConfirmDialog ("update template too?") on send,
   *   - PATCH /templates/:id when the user picks "Send and update".
   * Undefined for plain-upload drafts.
   */
  readonly fromTemplateId?: string | undefined;
  /**
   * `true` when the draft's PDF was freshly uploaded from the wizard's
   * "Upload a new one" branch — i.e. the saved template's example doc
   * was REPLACED. Drives the banner copy ("Saved layout adapted to your
   * new document"). Always undefined for `fromTemplateId === undefined`
   * drafts.
   */
  readonly fromTemplateFreshUpload?: boolean | undefined;
}

export interface AppUser {
  readonly id?: string | undefined;
  readonly name: string;
  readonly email?: string | undefined;
  readonly avatarUrl?: string | undefined;
}
