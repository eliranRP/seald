import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** Headers the Cloudflare Pages worker adds when it proxies the API host. */
export const PROXY_SECRET_HEADER = 'x-seald-proxy-secret';
export const PROXY_CLIENT_IP_HEADER = 'x-seald-client-ip';

/**
 * Paths the bridge answers without the proxy secret: the health check, and
 * the cron endpoints pg_cron calls straight at the function URL (they carry
 * their own X-Cron-Secret).
 */
function isDirectPath(path: string): boolean {
  return path === '/health' || path.startsWith('/internal/cron/');
}

function sameSecret(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * The bridge Edge Function has a public `*.supabase.co` URL besides the
 * API hostname the Cloudflare worker proxies (docs/supabase-native-architecture.md,
 * decision 6). The signer IP in the audit trail comes from X-Forwarded-For
 * (extractClientIp), which a direct caller could forge. So with a secret
 * configured:
 *
 * - a request carrying the proxy secret gets X-Forwarded-For set to the
 *   client IP the worker read from CF-Connecting-IP;
 * - a direct request to health or cron runs with no forwarded IP at all;
 * - any other direct request is refused, so the worker is the only way in.
 *
 * With no secret configured (local runs) requests pass unchanged.
 */
export function edgeProxyGuard(secret: string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!secret) {
      next();
      return;
    }
    const given = req.headers[PROXY_SECRET_HEADER];
    const clientIp = req.headers[PROXY_CLIENT_IP_HEADER];
    delete req.headers[PROXY_SECRET_HEADER];
    delete req.headers[PROXY_CLIENT_IP_HEADER];
    if (typeof given === 'string' && sameSecret(given, secret)) {
      if (typeof clientIp === 'string' && clientIp.length > 0) {
        req.headers['x-forwarded-for'] = clientIp;
      } else {
        delete req.headers['x-forwarded-for'];
      }
      next();
      return;
    }
    if (isDirectPath(req.path)) {
      delete req.headers['x-forwarded-for'];
      next();
      return;
    }
    res.status(403).json({ statusCode: 403, error: 'direct_access_forbidden' });
  };
}
