import { useEffect, useState } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
// Vite `?url` import returns the final emitted URL for the worker bundle at
// both dev and build time. Loading the worker this way avoids CORS issues
// and keeps pdfjs happy without needing any copy-to-public hack.
// eslint-disable-next-line import/no-unresolved, import/extensions
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Setting the worker once at module load is the pattern pdfjs-dist
// documents. Guard against HMR double-assignment in dev.
if (GlobalWorkerOptions.workerSrc !== pdfjsWorkerUrl) {
  GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;
}

export type { PDFDocumentProxy } from 'pdfjs-dist';

export interface UsePdfDocumentResult {
  readonly doc: PDFDocumentProxy | null;
  readonly numPages: number;
  readonly loading: boolean;
  readonly error: Error | null;
}

/**
 * Loads a PDF document from a `File` or remote URL and exposes the parsed
 * `PDFDocumentProxy`. Re-runs when `source` changes and cleans up the
 * previous document on unmount / replacement so native workers don't leak
 * across re-renders.
 */
export function usePdfDocument(source: File | string | null | undefined): UsePdfDocumentResult {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (source === null || source === undefined) {
      setDoc(null);
      setError(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    setLoading(true);
    setError(null);

    const run = async (): Promise<void> => {
      try {
        const task =
          typeof source === 'string'
            ? getDocument({ url: source })
            : getDocument({ data: new Uint8Array(await source.arrayBuffer()) });
        loaded = await task.promise;
        if (cancelled) {
          loaded.destroy().catch(() => {});
          return;
        }
        setDoc((prev) => {
          if (prev) {
            prev.destroy().catch(() => {});
          }
          return loaded;
        });
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run().catch(() => {
      // Errors are already captured into state via setError inside run();
      // this catch just absorbs the rejected promise itself.
    });

    return () => {
      cancelled = true;
      if (loaded) {
        loaded.destroy().catch(() => {});
      }
    };
  }, [source]);

  // Release the resident doc when the hook unmounts entirely.
  useEffect(
    () => () => {
      if (doc) doc.destroy().catch(() => {});
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return { doc, numPages: doc?.numPages ?? 0, loading, error };
}
