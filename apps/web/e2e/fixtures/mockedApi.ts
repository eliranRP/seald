import type { Page, Route } from '@playwright/test';

/**
 * Network-layer API mock.
 *
 * Installs a single `page.route()` handler covering the four URL families
 * the SPA can possibly hit during a test:
 *
 * 1. The same-origin Vite dev-server proxy at `/api/*` — used for the
 *    sender-facing axios `apiClient` (envelopes, contacts, dashboard).
 * 2. The same-origin signer surface at `/sign/*` — used by the recipient
 *    flow's `signApiClient` (start session, /me, accept-terms, fields,
 *    signature, submit, decline, pdf).
 * 3. The Supabase REST + Auth host at `http://127.0.0.1:54321/*` — the SPA
 *    talks to this directly (not via `/api/`), so for auth scenarios we
 *    must mock those endpoints too.
 * 4. The pdf-fixture URL the signer flow eventually fetches.
 *
 * Steps push handlers via `mockedApi.on(method, urlPattern, response)` and
 * later overrides via `mockedApi.override(...)`; first match wins, with
 * overrides taking precedence over base handlers. The fixture is reset
 * per-scenario by the `test.ts` fixture.
 */
export type JsonResponse = {
  status?: number;
  json?: unknown;
  body?: string;
  headers?: Record<string, string>;
  contentType?: string;
};

type Handler = {
  method: string;
  pattern: RegExp;
  respond: (route: Route) => Promise<void> | void;
};

// One regex covers all four URL families; the page.route filter only fires
// for matches so we keep the rest of network IO uninterrupted.
//
// Notes:
//  - Anchored on the host part so Vite dev-server source paths
//    (`/src/lib/api/queryClient.ts`) don't match the substring `/api/`.
//  - The `/sign/*` family is restricted to the actual signer-API endpoints
//    (`/sign/start`, `/sign/me`, `/sign/accept-terms`, `/sign/fields`,
//    `/sign/signature`, `/sign/submit`, `/sign/decline`, `/sign/pdf`,
//    `/sign/esign-disclosure`, `/sign/intent-to-sign`,
//    `/sign/withdraw-consent`) so we don't intercept SPA route navigations
//    like `GET /sign/<envelopeId>`, which the recipient flow uses for its
//    own URL.
const ROUTE_PATTERN =
  /^https?:\/\/[^/]+(\/api\/|\/sign\/(start|me|accept-terms|fields|signature|submit|decline|pdf|esign-disclosure|intent-to-sign|withdraw-consent)|\/auth\/v1\/|\/pdf-fixture\.pdf$)/;

export class MockedApi {
  private readonly handlers: Handler[] = [];
  private readonly overrides: Handler[] = [];
  private installed = false;

  constructor(private readonly page: Page) {}

  async install(): Promise<void> {
    if (this.installed) return;
    this.installed = true;
    await this.page.route(ROUTE_PATTERN, async (route) => {
      const request = route.request();
      const url = request.url();
      const method = request.method();
      // Overrides win — they're appended last by per-scenario customizations
      // that need to replace a default handler installed by the harness.
      const handler =
        this.overrides.find((h) => h.method === method && h.pattern.test(url)) ??
        this.handlers.find((h) => h.method === method && h.pattern.test(url));
      if (!handler) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'no mock registered', url, method }),
        });
        return;
      }
      await handler.respond(route);
    });
  }

  on(method: string, pattern: RegExp, response: JsonResponse): void {
    this.handlers.push({ method, pattern, respond: this.makeResponder(response) });
  }

  /** Replace any prior handler matching (method, pattern) for this scenario. */
  override(method: string, pattern: RegExp, response: JsonResponse): void {
    this.overrides.push({ method, pattern, respond: this.makeResponder(response) });
  }

  reset(): void {
    this.handlers.length = 0;
    this.overrides.length = 0;
  }

  private makeResponder(response: JsonResponse): (route: Route) => Promise<void> {
    return (route) => {
      const fulfill: Parameters<typeof route.fulfill>[0] = {
        status: response.status ?? 200,
        contentType:
          response.contentType ?? (response.json !== undefined ? 'application/json' : 'text/plain'),
        body: response.json !== undefined ? JSON.stringify(response.json) : (response.body ?? ''),
      };
      if (response.headers) fulfill.headers = response.headers;
      return route.fulfill(fulfill);
    };
  }
}
