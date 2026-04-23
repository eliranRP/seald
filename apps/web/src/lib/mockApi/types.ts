import type { PlacedFieldValue } from '../../components/PlacedField/PlacedField.types';

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
}

export interface AppUser {
  readonly id?: string | undefined;
  readonly name: string;
  readonly email?: string | undefined;
  readonly avatarUrl?: string | undefined;
}

export type EmailPreviewVariant = 'request' | 'completed';

export interface EmailPreviewDocument {
  readonly name: string;
  readonly meta: string;
}

export interface EmailPreviewSigner {
  readonly name: string;
  readonly email: string;
}

export interface EmailPreviewRequestContent {
  readonly variant: 'request';
  readonly brand: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly document: EmailPreviewDocument;
  readonly ctaLabel: string;
  readonly trust: string;
  readonly footer: string;
}

export interface EmailPreviewCompletedContent {
  readonly variant: 'completed';
  readonly brand: string;
  readonly title: string;
  readonly body: string;
  readonly signers: ReadonlyArray<EmailPreviewSigner>;
  readonly primaryActionLabel: string;
  readonly secondaryActionLabel: string;
  readonly footer: string;
}

export type EmailPreviewContent = EmailPreviewRequestContent | EmailPreviewCompletedContent;
