import * as Sentry from '@sentry/react';

/**
 * Initialise Sentry for the web app. Must be called before `createRoot` so
 * any render-time error is captured. Reads `VITE_SENTRY_DSN` from the Vite
 * env; if absent (dev / test / preview without observability), the call is a
 * silent no-op so we never spam DSN-less envs with init noise.
 */
// Infrastructure headers that can carry client IPs or upstream identities.
const NETWORK_IDENTITY_DENY = ['forwarded', '-ip', 'remote-', 'via', '-user'];

/**
 * Sentry 11 collects cookies, request/response bodies and user info unless
 * `dataCollection` says otherwise (v10 did not). seald's cookies carry the
 * signer session JWT, so this pins the v10 default from Sentry's
 * migration guide: nothing beyond what v10 sent.
 */
export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: {
    request: { deny: NETWORK_IDENTITY_DENY },
    response: { deny: NETWORK_IDENTITY_DENY },
  },
  httpBodies: [],
  urlQueryParams: { deny: NETWORK_IDENTITY_DENY },
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  graphQL: { document: false, variables: false },
} satisfies NonNullable<Parameters<typeof Sentry.init>[0]>['dataCollection'];

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
    dataCollection: SENTRY_DATA_COLLECTION,
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
