import { useCallback, useState } from 'react';

/**
 * Sanitises a user-provided envelope title for use as a filename. Drops any
 * character outside the safe ASCII subset (alnum + space + dash + underscore
 * + dot), collapses whitespace, and falls back to `document` when the result
 * is empty so we never trigger a browser download with no filename.
 */
function safeFilename(raw: string): string {
  const cleaned = raw
    .replace(/[^A-Za-z0-9 \-_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const base = cleaned.length > 0 ? cleaned : 'document';
  return /\.pdf$/i.test(base) ? base : `${base}.pdf`;
}

export interface UseDownloadPdfOptions {
  /**
   * Resolves the PDF URL the document viewer is currently rendering from.
   * The hook fetches that URL itself (rather than relying on the browser's
   * `<a download>` attribute, which is silently ignored cross-origin) so
   * the signer always gets a real file, not a navigated PDF preview.
   *
   * Mutually exclusive with `getBlob` — provide one or the other.
   */
  readonly getUrl?: () => Promise<string> | string;
  /**
   * Resolves the PDF as a `Blob` directly — used by the mobile sender flow
   * where the original `File` is already in memory and we don't want to
   * round-trip through a fetch.
   */
  readonly getBlob?: () => Promise<Blob> | Blob;
  /**
   * Suggested filename — usually the envelope title. The hook strips any
   * unsafe characters and appends `.pdf` if missing.
   */
  readonly filename: string;
}

export interface UseDownloadPdfResult {
  readonly download: () => Promise<void>;
  readonly busy: boolean;
  readonly error: Error | null;
}

/**
 * Triggers a client-side download of the original (unsigned) PDF the signer
 * is currently viewing.
 *
 * The hook fetches the PDF as a `Blob` (so cross-origin signed URLs still
 * download as a file rather than navigating the tab), creates a transient
 * object URL, clicks a hidden anchor, and revokes the URL on the next tick
 * to avoid leaking memory. Same-origin direct-anchor download is handled
 * implicitly by the same flow — a `Blob` URL is always same-origin to the
 * page that created it.
 *
 * The hook is shape-driven (no UI). Consumers wire it to a button and pick
 * placement; the desktop signing header and the mobile sender drawer share
 * this hook.
 */
export function useDownloadPdf(options: UseDownloadPdfOptions): UseDownloadPdfResult {
  const { getUrl, getBlob, filename } = options;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const download = useCallback(async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      let blob: Blob;
      if (getBlob) {
        blob = await Promise.resolve(getBlob());
      } else if (getUrl) {
        const url = await Promise.resolve(getUrl());
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`PDF fetch failed (${String(res.status)})`);
        }
        blob = await res.blob();
      } else {
        throw new Error('useDownloadPdf: must provide getUrl or getBlob');
      }

      const objectUrl = URL.createObjectURL(blob);
      try {
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = safeFilename(filename);
        a.rel = 'noopener';
        // Some browsers won't honour the click on an unattached anchor.
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } finally {
        // Defer revoke so Safari/iOS finishes the download first; the spec
        // permits revoking immediately, but real browsers are lenient with
        // a microtask gap. Falling back to setTimeout(0) keeps jsdom happy.
        setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      }
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Unknown download error');
      setError(e);
      throw e;
    } finally {
      setBusy(false);
    }
  }, [busy, getBlob, getUrl, filename]);

  return { download, busy, error };
}
