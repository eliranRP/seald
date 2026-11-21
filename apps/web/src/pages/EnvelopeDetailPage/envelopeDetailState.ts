import type { EnvelopeSigner } from '@/features/envelopes';
import type { DownloadKind } from './DownloadSplitButton';

/**
 * The page's one-at-a-time UI states, each a single value so impossible
 * combinations (fix and replace open together, "busy" with no target, two
 * remind spinners racing) cannot be represented.
 */

/** The inline email fix or the replace dialog: at most one signer, busy only with a target. */
export type SignerEdit =
  | { readonly kind: 'idle' }
  | { readonly kind: 'fixing'; readonly signerId: string; readonly busy: boolean }
  | { readonly kind: 'replacing'; readonly signer: EnvelopeSigner; readonly busy: boolean };

export type SignerEditEvent =
  | { readonly type: 'open-fix'; readonly signerId: string }
  | { readonly type: 'open-replace'; readonly signer: EnvelopeSigner }
  | { readonly type: 'close' }
  /** The request for this signer left; only the open target turns busy. */
  | { readonly type: 'submit'; readonly signerId: string }
  /** The request for this signer finished. A stale answer for another signer changes nothing. */
  | { readonly type: 'succeeded'; readonly signerId: string }
  | { readonly type: 'failed'; readonly signerId: string };

export const SIGNER_EDIT_IDLE: SignerEdit = { kind: 'idle' };

function targetId(state: SignerEdit): string | null {
  if (state.kind === 'fixing') return state.signerId;
  if (state.kind === 'replacing') return state.signer.id;
  return null;
}

function withBusy(state: SignerEdit, busy: boolean): SignerEdit {
  if (state.kind === 'idle' || state.busy === busy) return state;
  return { ...state, busy };
}

export function signerEditReducer(state: SignerEdit, event: SignerEditEvent): SignerEdit {
  switch (event.type) {
    case 'open-fix':
      return { kind: 'fixing', signerId: event.signerId, busy: false };
    case 'open-replace':
      return { kind: 'replacing', signer: event.signer, busy: false };
    case 'close':
      return SIGNER_EDIT_IDLE;
    case 'submit':
      return targetId(state) === event.signerId ? withBusy(state, true) : state;
    case 'succeeded':
      return targetId(state) === event.signerId ? SIGNER_EDIT_IDLE : state;
    case 'failed':
      return targetId(state) === event.signerId ? withBusy(state, false) : state;
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

/** Signer whose inline email fix is open, if any. */
export function fixingSignerId(state: SignerEdit): string | null {
  return state.kind === 'fixing' ? state.signerId : null;
}

/** Signer in the replace dialog, if any. */
export function replacingSigner(state: SignerEdit): EnvelopeSigner | null {
  return state.kind === 'replacing' ? state.signer : null;
}

/** The reminder request in flight: none, one signer's row, or Remind all. */
export type RemindState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'one'; readonly signerId: string }
  | { readonly kind: 'all' };

export const REMIND_IDLE: RemindState = { kind: 'idle' };

/** The signer row whose Remind button spins. */
export function remindingSignerId(state: RemindState): string | null {
  return state.kind === 'one' ? state.signerId : null;
}

/** The download in flight: a header artifact (sealed, audit, original, zip) or one document. */
export type DownloadState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'artifact'; readonly which: Exclude<DownloadKind, 'gdrive'> }
  | { readonly kind: 'document'; readonly documentId: string };

export const DOWNLOAD_IDLE: DownloadState = { kind: 'idle' };

/** Busy key for the Download split button (`'gdrive'` comes from the Drive hook). */
export function splitButtonBusy(state: DownloadState, gdriveInFlight: boolean): string | null {
  if (gdriveInFlight) return 'gdrive';
  return state.kind === 'artifact' ? state.which : null;
}

/** Busy key for the documents card: a document id, or `'zip'` for Download all. */
export function documentsCardBusy(state: DownloadState): string | null {
  if (state.kind === 'document') return state.documentId;
  if (state.kind === 'artifact' && state.which === 'zip') return 'zip';
  return null;
}

/** The header's More menu and the withdraw confirmation never show together. */
export type HeaderOverlay = 'none' | 'more' | 'withdraw';
