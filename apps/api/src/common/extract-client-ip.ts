import type { Request } from 'express';

/**
 * Best-effort client IP extraction. Caddy in prod sets X-Forwarded-For with
 * the original client first (we control the proxy, so the first entry is
 * trusted). Dev runs without a proxy — fall back to the raw socket peer,
 * which surfaces `::1` for localhost requests.
 *
 * Used by every audited request (signing flow + sender lifecycle) so the
 * audit-trail PDF can show a real IP next to each event.
 */
export function extractClientIp(req: Request): string | null {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress ?? null;
}
