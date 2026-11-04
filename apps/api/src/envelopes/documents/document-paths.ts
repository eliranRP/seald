/**
 * WP-03 storage layout. Document 1 keeps the legacy paths, so `/verify`
 * and download links handed out before multi-file envelopes stay valid.
 * Every other document lives under `{envelope_id}/documents/{document_id}/`.
 */
export function legacyOriginalPath(envelope_id: string): string {
  return `${envelope_id}/original.pdf`;
}

export function documentOriginalPath(envelope_id: string, document_id: string): string {
  return `${envelope_id}/documents/${document_id}/original.pdf`;
}

/** Sealed path for the document in slot `ord` at seal time. */
export function documentSealedPath(envelope_id: string, document_id: string, ord: number): string {
  return ord === 1
    ? `${envelope_id}/sealed.pdf`
    : `${envelope_id}/documents/${document_id}/sealed.pdf`;
}

/** Stamped "not signed" copy (WP-01) of the document in slot `ord`. */
export function documentDeclinedPath(
  envelope_id: string,
  document_id: string,
  ord: number,
): string {
  return ord === 1
    ? `${envelope_id}/declined.pdf`
    : `${envelope_id}/documents/${document_id}/declined.pdf`;
}

/**
 * Cached zip of every sealed document (immutable once sealed). The audit
 * trail is not in it; it is downloaded on its own. `sealed-documents.zip`
 * replaces the older `documents.zip`, which also held audit.pdf.
 */
export function sealedBundlePath(envelope_id: string): string {
  return `${envelope_id}/sealed-documents.zip`;
}
