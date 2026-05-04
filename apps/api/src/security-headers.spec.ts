import express from 'express';
import request from 'supertest';
import { securityHeaders } from './security-headers';

/**
 * Bug I (Phase 6.A iter-2 PROD, 2026-05-04). Helmet's defaults set
 *   Cross-Origin-Opener-Policy: same-origin
 * which permanently severs `window.opener` for the Drive OAuth popup
 * (web → api → web bridge): the cross-origin api response with
 * `same-origin` puts the popup in a fresh browsing context group,
 * and the severance survives the redirect back to the same-origin
 * bridge route. The popup's bridge then sees opener=null, falls
 * through to its same-tab fallback, and AppShell's mobile-viewport
 * guard navigates the popup to /m/send.
 *
 * The api is JSON-only + one OAuth redirect — COOP gives no
 * meaningful protection here, so we disable it.
 */
describe('securityHeaders()', () => {
  it('does NOT set Cross-Origin-Opener-Policy: same-origin (would sever popup opener)', async () => {
    const app = express();
    app.use(securityHeaders());
    app.get('/', (_req, res) => res.json({ ok: true }));
    const res = await request(app).get('/');
    // `same-origin` is the helmet default that we MUST override.
    expect(res.headers['cross-origin-opener-policy']).not.toBe('same-origin');
  });

  it('still sets the other helmet protections (HSTS, X-Content-Type-Options, X-Frame-Options)', async () => {
    const app = express();
    app.use(securityHeaders());
    app.get('/', (_req, res) => res.json({ ok: true }));
    const res = await request(app).get('/');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
  });
});
