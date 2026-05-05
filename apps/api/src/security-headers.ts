import helmet from 'helmet';
import type { RequestHandler, Request, Response, NextFunction } from 'express';

/**
 * Helmet middleware factory for the API.
 *
 * Why a factory: the helmet config is non-trivial (one explicit
 * override) and we need to unit-test the resulting headers without
 * importing `main.ts` (which calls `bootstrap()` at module load).
 *
 * Cross-Origin-Opener-Policy is explicitly disabled. Helmet's default
 * is `same-origin`, which puts a cross-origin popup into a fresh
 * browsing-context group and severs `window.opener` permanently — even
 * after the popup later navigates back to the opener's origin. That
 * breaks the Drive OAuth popup-bridge flow (web → api → web bridge),
 * because the bridge component sees `window.opener === null` and falls
 * through to its same-tab fallback.
 *
 * The API is JSON-only plus one OAuth redirect; COOP gives no
 * meaningful protection here. The other helmet defaults (HSTS,
 * nosniff, frameguard, referrer-policy, etc.) stay on.
 *
 * Bug I (Phase 6.A iter-2 PROD, 2026-05-04).
 */
export function securityHeaders(): RequestHandler {
  const helmetMiddleware = helmet({
    crossOriginOpenerPolicy: false,
  });

  // Compose helmet with a Permissions-Policy header (nodejs-security 7.5).
  // Helmet does not set this by default — we lock down capabilities the API
  // never uses so a compromised page context cannot request them.
  return (req: Request, res: Response, next: NextFunction): void => {
    helmetMiddleware(req, res, () => {
      res.setHeader(
        'Permissions-Policy',
        'geolocation=(), camera=(), microphone=(), payment=(), usb=()',
      );
      next();
    });
  };
}
