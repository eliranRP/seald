import type { AddSignerContact } from '../../components/AddSignerDropdown/AddSignerDropdown.types';
import { SEED_CONTACTS } from './data/contacts';
import { SEED_DOCUMENTS } from './data/documents';
import { getEmailPreviewSeed } from './data/emailPreview';
import { SEED_USER } from './data/user';
import type { AppDocument, AppUser, EmailPreviewContent, EmailPreviewVariant } from './types';

export type {
  AppDocument,
  AppUser,
  DocumentSigner,
  DocumentStatus,
  EmailPreviewCompletedContent,
  EmailPreviewContent,
  EmailPreviewDocument,
  EmailPreviewRequestContent,
  EmailPreviewSigner,
  EmailPreviewVariant,
} from './types';

export { SIGNER_COLOR_PALETTE } from './data/palette';
export type { SignerColor } from './data/palette';

/**
 * Tiny simulated network delay so consumers have to treat the result as async
 * (and render loading state) even though we resolve from in-memory data.
 * Keeping this low so tests remain fast; the real server will be slower.
 */
const SIMULATED_LATENCY_MS = 10;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(value), SIMULATED_LATENCY_MS);
  });
}

export function fetchCurrentUser(): Promise<AppUser> {
  return delay(SEED_USER);
}

export function fetchContacts(): Promise<ReadonlyArray<AddSignerContact>> {
  return delay(SEED_CONTACTS);
}

export function fetchDocuments(): Promise<ReadonlyArray<AppDocument>> {
  return delay(SEED_DOCUMENTS);
}

export function fetchEmailPreview(variant: EmailPreviewVariant): Promise<EmailPreviewContent> {
  return delay(getEmailPreviewSeed(variant));
}
