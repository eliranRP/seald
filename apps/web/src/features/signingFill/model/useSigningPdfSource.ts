import { useEffect, useState } from 'react';
import { getPdfSignedUrl } from '@/features/signing';

/**
 * Resolves the short-lived signed URL for the envelope PDF.
 *
 * The signed URL expires after 90s — refetch when the envelope identity
 * changes (practically: once per signing session). pdf.js then loads the
 * URL with no credentials (auth is in the URL itself), sidestepping the
 * Supabase/browser cross-origin-credentials CORS failure we'd hit by
 * redirect-following /sign/pdf.
 *
 * Returns `null` until the first resolution; consumers (e.g. DocumentPageCanvas)
 * render a graceful placeholder for `null`.
 */
export function useSigningPdfSource(
  envelopeId: string | undefined,
  /**
   * Multi-document envelopes (WP-04): the document to load. Omitted, the
   * API serves document 1, exactly as for a single-PDF envelope.
   */
  documentId?: string,
): string | null {
  const [pdfSrc, setPdfSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!envelopeId) return undefined;
    let cancelled = false;
    // A different document means a different file: drop the previous one
    // so the canvas shows its placeholder instead of the wrong PDF.
    setPdfSrc(null);
    (async () => {
      try {
        const url =
          documentId === undefined
            ? await getPdfSignedUrl()
            : await getPdfSignedUrl(undefined, documentId);
        if (!cancelled) setPdfSrc(url);
      } catch {
        /* DocumentPageCanvas renders a graceful placeholder on null. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [envelopeId, documentId]);
  return pdfSrc;
}
