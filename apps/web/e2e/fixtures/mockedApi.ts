import type { Page, Route } from '@playwright/test';

/**
 * Network-layer API mock. Installs a single `page.route()` handler covering
 * `/api/*` and `/sign/*` URLs (rule 3.5). Steps push handlers through
 * `mockedApi.on(method, urlPattern, response)`; first match wins. The
 * fixture is per-scenario — Playwright resets `page` between tests so
 * there is zero shared state (rule 5.4).
 */
export type JsonResponse = {
  status?: number;
  json?: unknown;
  body?: string;
  headers?: Record<string, string>;
};

type Handler = {
  method: string;
  pattern: RegExp;
  respond: (route: Route) => Promise<void> | void;
};

export class MockedApi {
  private readonly handlers: Handler[] = [];

  constructor(private readonly page: Page) {}

  async install(): Promise<void> {
    await this.page.route(/\/(api|sign)\//, async (route) => {
      const request = route.request();
      const url = request.url();
      const method = request.method();
      const handler = this.handlers.find((h) => h.method === method && h.pattern.test(url));
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
    this.handlers.push({
      method,
      pattern,
      respond: (route) =>
        route.fulfill({
          status: response.status ?? 200,
          contentType: response.json !== undefined ? 'application/json' : 'text/plain',
          headers: response.headers,
          body: response.json !== undefined ? JSON.stringify(response.json) : (response.body ?? ''),
        }),
    });
  }

  reset(): void {
    this.handlers.length = 0;
  }
}
