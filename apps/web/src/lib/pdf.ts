import { useEffect, useState } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
// Vite `?worker&url` bundles our local worker entry (which installs the
// Map.upsert polyfill before delegating to pdfjs's real worker). Loading
// the worker this way avoids CORS issues and keeps pdfjs happy without a
// copy-to-public hack.
// eslint-disable-next-line import/no-unresolved
import pdfjsWorkerUrl from './pdfjsWorker?worker&url';

// pdfjs-dist v5 calls `getOrInsertComputed` (and the sibling `getOrInsert`)
// from the TC39 Map/WeakMap upsert proposal — currently stage-3 and not yet
// shipping in stable Chrome / Safari. Without these, page.render() throws
// "...getOrInsertComputed is not a function" and the canvas paints nothing
// (or paints partially then errors). Polyfill all four at module load,
// before anything reaches getDocument/page.render.
type UpsertCommon<K, V> = {
  has(key: K): boolean;
  get(key: K): V | undefined;
  set(key: K, value: V): unknown;
};
function installUpsert<K, V>(proto: UpsertCommon<K, V>): void {
  const p = proto as UpsertCommon<K, V> & {
    getOrInsertComputed?: (key: K, callbackfn: (key: K) => V) => V;
    getOrInsert?: (key: K, value: V) => V;
  };
  if (typeof p.getOrInsertComputed !== 'function') {
    Object.defineProperty(proto, 'getOrInsertComputed', {
      configurable: true,
      writable: true,
      value: function (this: UpsertCommon<K, V>, key: K, callbackfn: (k: K) => V): V {
        if (this.has(key)) return this.get(key) as V;
        const value = callbackfn(key);
        this.set(key, value);
        return value;
      },
    });
  }
  if (typeof p.getOrInsert !== 'function') {
    Object.defineProperty(proto, 'getOrInsert', {
      configurable: true,
      writable: true,
      value: function (this: UpsertCommon<K, V>, key: K, value: V): V {
        if (this.has(key)) return this.get(key) as V;
        this.set(key, value);
        return value;
      },
    });
  }
}
installUpsert(Map.prototype as unknown as UpsertCommon<unknown, unknown>);
installUpsert(WeakMap.prototype as unknown as UpsertCommon<object, unknown>);

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
            ? // No credentials: the signing flow's PDF URL is a Supabase
              // signed URL with auth baked in; sending credentials here
              // would trip the origin's CORS (Supabase storage doesn't
              // emit Access-Control-Allow-Credentials).
              getDocument({ url: source })
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
