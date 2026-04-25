import * as Sentry from '@sentry/react';

/**
 * Initialise Sentry for the web app. Must be called before `createRoot` so
 * any render-time error is captured. Reads `VITE_SENTRY_DSN` from the Vite
 * env; if absent (dev / test / preview without observability), the call is a
 * silent no-op so we never spam DSN-less envs with init noise.
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (typeof dsn !== 'string' || dsn.length === 0) return;

  Sentry.init({
    dsn,
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    environment: import.meta.env.MODE,
  });
}

/**
 * Thin wrapper over `Sentry.captureException` so call-sites don't import the
 * SDK directly — keeps the surface area small and lets us swap providers
 * without sweeping the codebase.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (context) {
    Sentry.captureException(error, { extra: context });
    return;
  }
  Sentry.captureException(error);
}
