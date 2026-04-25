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
export function useSigningPdfSource(envelopeId: string | undefined): string | null {
  const [pdfSrc, setPdfSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!envelopeId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const url = await getPdfSignedUrl();
        if (!cancelled) setPdfSrc(url);
      } catch {
        /* DocumentPageCanvas renders a graceful placeholder on null. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [envelopeId]);
  return pdfSrc;
}
