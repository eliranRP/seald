import type { NextFunction, Request, Response } from 'express';
import { extractClientIp } from '../../common/extract-client-ip';
import { PROXY_CLIENT_IP_HEADER, PROXY_SECRET_HEADER, edgeProxyGuard } from '../proxy-guard';

/**
 * The bridge's client IP (audit trail, throttling) must come only from the
 * Cloudflare proxy, never from a direct caller of the function URL.
 */

const SECRET = 'p'.repeat(48);

function run(path: string, headers: Record<string, string>, secret: string | null = SECRET) {
  const req = { path, headers: { ...headers }, socket: {} } as unknown as Request;
  let status: number | null = null;
  let body: unknown = null;
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json(payload: unknown) {
      body = payload;
      return this;
    },
  } as unknown as Response;
  const next = jest.fn() as unknown as NextFunction;
  edgeProxyGuard(secret ?? undefined)(req, res, next);
  return { req, status, body, passed: (next as jest.Mock).mock.calls.length === 1 };
}

describe('edgeProxyGuard', () => {
  it('takes the client IP from the proxy header when the secret matches', () => {
    const { req, passed } = run('/sign/start', {
      [PROXY_SECRET_HEADER]: SECRET,
      [PROXY_CLIENT_IP_HEADER]: '203.0.113.7',
      'x-forwarded-for': '198.51.100.1, 10.0.0.1',
    });
    expect(passed).toBe(true);
    expect(extractClientIp(req)).toBe('203.0.113.7');
    expect(req.headers[PROXY_SECRET_HEADER]).toBeUndefined();
    expect(req.headers[PROXY_CLIENT_IP_HEADER]).toBeUndefined();
  });

  it('refuses a direct call with a forged X-Forwarded-For', () => {
    const { status, body, passed } = run('/sign/start', {
      'x-forwarded-for': '203.0.113.7',
      [PROXY_CLIENT_IP_HEADER]: '203.0.113.7',
    });
    expect(passed).toBe(false);
    expect(status).toBe(403);
    expect(body).toMatchObject({ error: 'direct_access_forbidden' });
  });

  it('refuses a wrong proxy secret', () => {
    expect(run('/envelopes', { [PROXY_SECRET_HEADER]: 'nope' }).status).toBe(403);
  });

  it.each(['/health', '/internal/cron/tick'])(
    'lets %s through directly, with no forwarded IP',
    (path) => {
      const { req, passed } = run(path, { 'x-forwarded-for': '203.0.113.7' });
      expect(passed).toBe(true);
      expect(req.headers['x-forwarded-for']).toBeUndefined();
    },
  );

  it('passes everything unchanged with no secret configured (local runs)', () => {
    const { req, passed } = run('/sign/start', { 'x-forwarded-for': '198.51.100.1' }, null);
    expect(passed).toBe(true);
    expect(req.headers['x-forwarded-for']).toBe('198.51.100.1');
  });
});
