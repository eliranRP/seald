import { useEffect, useState } from 'react';

/**
 * One-shot loader for the Google API JS bundle (`apis.google.com/js/api.js`)
 * + the `picker` sub-library. The script tag is added to `<head>` once
 * per page-load via a module-scoped Promise so that multiple
 * `<DrivePicker />` instances share a single network fetch.
 *
 * `retry()` invalidates the cached Promise + removes the previous
 * `<script>` tag so a transient load failure can be re-attempted with
 * a fresh request. We never auto-retry — the user clicks Retry.
 *
 * Single responsibility: load the library + report ready/error. It
 * does NOT fetch credentials, build the picker, or know about
 * `drive.file` (rule 4.4).
 */

const GAPI_SRC = 'https://apis.google.com/js/api.js';
const SCRIPT_DOM_ID = 'gapi-loader';

interface GapiGlobal {
  load(name: 'picker', cfg: { callback: () => void }): void;
}

let inFlight: Promise<void> | null = null;

function readGapi(): GapiGlobal | undefined {
  return (window as unknown as { gapi?: GapiGlobal }).gapi;
}

function loadGapiScript(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_DOM_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement('script');
    if (!existing) {
      script.id = SCRIPT_DOM_ID;
      script.src = GAPI_SRC;
      script.async = true;
      script.defer = true;
    }
    const onLoad = (): void => {
      const gapi = readGapi();
      if (!gapi) {
        reject(new Error('gapi global missing after script load'));
        return;
      }
      gapi.load('picker', { callback: () => resolve() });
    };
    const onError = (): void => {
      reject(new Error(`Failed to load ${GAPI_SRC}`));
    };
    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });
    if (!existing) {
      document.head.appendChild(script);
    } else if (readGapi()) {
      // Script already in DOM and gapi already populated — resolve next tick.
      onLoad();
    }
  });
  return inFlight;
}

function resetLoader(): void {
  inFlight = null;
  const existing = document.getElementById(SCRIPT_DOM_ID);
  existing?.parentNode?.removeChild(existing);
}

export interface UseGoogleApiResult {
  readonly ready: boolean;
  readonly error: Error | null;
  readonly retry: () => void;
}

export function useGoogleApi(enabled: boolean): UseGoogleApiResult {
  const [ready, setReady] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState<number>(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setReady(false);
    setError(null);
    loadGapiScript()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, attempt]);

  return {
    ready,
    error,
    retry: () => {
      resetLoader();
      setAttempt((n) => n + 1);
    },
  };
}

/** Test-only: clear the module-level promise + script tag between specs. */
export function __resetGoogleApiLoaderForTests(): void {
  resetLoader();
}
