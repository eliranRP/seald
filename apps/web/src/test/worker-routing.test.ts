import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { apiProxyUrl, isSpaRoute, MARKETING_PATHS } from '../../../landing/_worker.js';
import { QUIET_ROBOTS_TXT, robotsTxt } from '../../../landing/indexing.config.js';

/**
 * Behavioral coverage for apps/landing/_worker.js (SEO cycle S1a).
 * The string pins in the settings and OAuth routing tests stay; this
 * file drives the fetch handler with a fake ASSETS binding.
 */

interface AssetFile {
  readonly body: string;
  readonly contentType: string;
  readonly etag: string;
  readonly status?: number;
}

function securityHeaders(): Record<string, string> {
  const raw = readFileSync(resolve(__dirname, '../../../landing/public/_headers'), 'utf8');
  const block = raw.split('# Long-cache')[0] ?? '';
  const headers: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const match = /^ {2}([^:\s][^:]*):\s*(.+)$/.exec(line);
    if (!match) continue;
    const name = match[1];
    const value = match[2];
    if (name && value) headers[name.toLowerCase()] = value.trim();
  }
  return headers;
}

const HOME = '<!doctype html><title>Seald — home</title>';
const MISSING = '<!doctype html><title>Page not found</title><h1>Page not found</h1>';
const SPA = '<!doctype html><title>Seald</title>';

function assetsFrom(files: Record<string, AssetFile>) {
  const fetched: string[] = [];
  const env = {
    ASSETS: {
      fetch(request: Request): Promise<Response> {
        const pathname = new URL(request.url).pathname;
        fetched.push(pathname);
        const file = files[pathname];
        if (!file) {
          const home = files['/'];
          return Promise.resolve(
            new Response(home?.body ?? HOME, {
              status: 200,
              headers: {
                'content-type': 'text/html; charset=utf-8',
                etag: home?.etag ?? '"home"',
              },
            }),
          );
        }
        return Promise.resolve(
          new Response(file.body, {
            status: file.status ?? 200,
            statusText: file.status === 308 ? 'Permanent Redirect' : 'OK',
            headers: {
              'content-type': file.contentType,
              etag: file.etag,
              ...(file.status === 308 ? { location: '/should-not-leak' } : {}),
            },
          }),
        );
      },
    },
  };
  return { env, fetched };
}

function site() {
  return assetsFrom({
    '/': { body: HOME, contentType: 'text/html; charset=utf-8', etag: '"home"' },
    '/404': { body: MISSING, contentType: 'text/html; charset=utf-8', etag: '"missing"' },
    '/app': { body: SPA, contentType: 'text/html; charset=utf-8', etag: '"app"' },
    '/contact': {
      body: '<!doctype html><title>Contact</title>',
      contentType: 'text/html; charset=utf-8',
      etag: '"contact"',
    },
    '/favicon.ico': {
      body: 'icon',
      contentType: 'image/x-icon',
      etag: '"ico"',
    },
    '/robots.txt': {
      body: 'User-agent: *\nAllow: /\n',
      contentType: 'text/plain; charset=utf-8',
      etag: '"robots"',
    },
    '/sitemap.xml': {
      body: '<?xml version="1.0" encoding="UTF-8"?><urlset></urlset>',
      contentType: 'application/xml; charset=utf-8',
      etag: '"sitemap"',
    },
    '/llms.txt': {
      body: '# Seald\n',
      contentType: 'text/plain; charset=utf-8',
      etag: '"llms"',
    },
  });
}

describe('apps/landing/_worker.js routing', () => {
  it('treats sent, app, and auth paths as the SPA', () => {
    expect(isSpaRoute('/sent/abc')).toBe(true);
    expect(isSpaRoute('/sent')).toBe(true);
    expect(isSpaRoute('/app')).toBe(true);
    expect(isSpaRoute('/signin')).toBe(true);
    expect(isSpaRoute('/settings/integrations')).toBe(true);
    // Settings index + Developers (WP-16), covered by the '/settings/' and '/m/' prefixes.
    for (const path of [
      '/settings',
      '/settings/developers',
      '/m/settings',
      '/m/settings/developers',
    ]) {
      expect(isSpaRoute(path), path).toBe(true);
    }
    expect(isSpaRoute('/contact')).toBe(false);
    expect(isSpaRoute('/')).toBe(false);
  });

  it('lists every public marketing path without a trailing slash', () => {
    expect(MARKETING_PATHS).toContain('/');
    expect(MARKETING_PATHS).toContain('/contact');
    expect(MARKETING_PATHS).toContain('/legal/privacy');
    for (const path of MARKETING_PATHS) {
      if (path !== '/') expect(path.endsWith('/')).toBe(false);
    }
  });

  it('rewrites SPA routes to /app and sets X-Robots-Tag', async () => {
    for (const path of [
      '/signin',
      '/sent/abc',
      '/sent',
      '/app',
      '/templates',
      '/m/send',
      '/sign/abc',
      '/verify/abc',
      '/document/abc/sent',
      '/oauth/gdrive/callback',
      '/settings/integrations',
    ]) {
      const { env, fetched } = site();
      const response = await worker.fetch(new Request(`https://seald.nromomentum.com${path}`), env);
      expect(response.status, path).toBe(200);
      expect(response.headers.get('x-robots-tag'), path).toBe('noindex, nofollow');
      expect(await response.text(), path).toBe(SPA);
      expect(fetched[0], path).toBe('/app');
    }
  });

  it('serves the approval pages unframeable, uncached, without referrer or beacon (WP-22)', async () => {
    const consent = '<script defer src="/scripts/cookie-consent.js"></script>';
    for (const path of ['/approve', '/approve/abc', '/approve/abc/review', '/oauth/mcp/consent']) {
      const { env } = assetsFrom({
        '/app': {
          body: `<!doctype html><title>Seald</title>${consent}`,
          contentType: 'text/html; charset=utf-8',
          etag: '"app"',
        },
      });
      const response = await worker.fetch(new Request(`https://seald.nromomentum.com${path}`), env);
      expect(response.status, path).toBe(200);
      expect(response.headers.get('x-frame-options'), path).toBe('DENY');
      expect(response.headers.get('content-security-policy'), path).toContain(
        "frame-ancestors 'none'",
      );
      expect(response.headers.get('cache-control'), path).toBe('no-store');
      expect(response.headers.get('referrer-policy'), path).toBe('no-referrer');
      expect(response.headers.get('etag'), path).toBeNull();
      expect(await response.text(), path).toBe('<!doctype html><title>Seald</title>');
    }
  });

  it('keeps the regular headers on other SPA routes', async () => {
    const { env } = site();
    const response = await worker.fetch(
      new Request('https://seald.nromomentum.com/approvals'),
      env,
    );
    expect(response.headers.get('x-frame-options')).not.toBe('DENY');
  });

  it('serves a marketing page at the extensionless path with status 200', async () => {
    const { env, fetched } = site();
    const response = await worker.fetch(new Request('https://seald.nromomentum.com/contact'), env);
    expect(response.status).toBe(200);
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(await response.text()).toContain('Contact');
    expect(fetched).toEqual(['/contact']);
  });

  it('308s trailing-slash and .html aliases to the canonical path', async () => {
    const cases: Array<[string, string]> = [
      ['/contact/', '/contact'],
      ['/contact.html', '/contact'],
      ['/legal/privacy/', '/legal/privacy'],
      ['/index.html', '/'],
    ];
    for (const [from, to] of cases) {
      const { env } = site();
      const response = await worker.fetch(new Request(`https://seald.nromomentum.com${from}`), env);
      expect(response.status, from).toBe(308);
      expect(response.headers.get('location'), from).toBe(`https://seald.nromomentum.com${to}`);
      expect(response.headers.get('x-robots-tag'), from).toBe('noindex, nofollow');
      for (const [name, value] of Object.entries(securityHeaders())) {
        expect(response.headers.get(name), `${from} ${name}`).toBe(value);
      }
    }
  });

  it('returns HTTP 404 with the not-found page for an unknown path', async () => {
    const { env, fetched } = site();
    const response = await worker.fetch(
      new Request('https://seald.nromomentum.com/nonexistent-xyz'),
      env,
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(await response.text()).toContain('Page not found');
    expect(fetched).toContain('/');
    expect(fetched).toContain('/404');
  });

  it('does not serve the homepage body for a missing font', async () => {
    const { env } = site();
    const response = await worker.fetch(
      new Request('https://seald.nromomentum.com/fonts/inter-variable.woff2'),
      env,
    );
    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).toContain('Page not found');
    expect(body).not.toContain('Seald — home');
  });

  it('serves a real static file instead of the 404 page', async () => {
    const { env } = site();
    const response = await worker.fetch(
      new Request('https://seald.nromomentum.com/favicon.ico'),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(response.headers.get('content-type')).toContain('image/x-icon');
    expect(await response.text()).toBe('icon');
  });

  it('follows an asset-pipeline trailing-slash redirect internally for canonical URLs', async () => {
    const fetched: string[] = [];
    const env = {
      ASSETS: {
        fetch(request: Request): Promise<Response> {
          const pathname = new URL(request.url).pathname;
          fetched.push(pathname);
          if (pathname === '/contact') {
            return Promise.resolve(
              new Response(null, {
                status: 308,
                headers: { location: 'https://seald.nromomentum.com/contact/' },
              }),
            );
          }
          if (pathname === '/contact/') {
            return Promise.resolve(
              new Response('<!doctype html><title>Contact</title>', {
                status: 200,
                headers: { 'content-type': 'text/html', etag: '"contact"' },
              }),
            );
          }
          return Promise.resolve(new Response('missing', { status: 404 }));
        },
      },
    };
    const response = await worker.fetch(new Request('https://seald.nromomentum.com/contact'), env);
    expect(response.status).toBe(200);
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(await response.text()).toContain('Contact');
    expect(fetched).toEqual(['/contact', '/contact/']);
  });

  it('serves the Search Console file at its .html URL, not the SPA or the 404', async () => {
    const token = 'google-site-verification: google9a27f9c75cdae2dc.html';
    const { env, fetched } = assetsFrom({
      '/': { body: HOME, contentType: 'text/html; charset=utf-8', etag: '"home"' },
      '/404': { body: MISSING, contentType: 'text/html; charset=utf-8', etag: '"missing"' },
      '/app': { body: SPA, contentType: 'text/html; charset=utf-8', etag: '"app"' },
      '/google9a27f9c75cdae2dc.html': {
        body: token,
        contentType: 'text/html; charset=utf-8',
        etag: '"gsc"',
      },
    });
    const response = await worker.fetch(
      new Request('https://seald.nromomentum.com/google9a27f9c75cdae2dc.html'),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(await response.text()).toBe(token);
    expect(fetched).not.toContain('/app');
    expect(fetched).not.toContain('/404');
  });

  it('keeps a 200 on the .html verification URL when assets strip the extension', async () => {
    const token = 'google-site-verification: google9a27f9c75cdae2dc.html';
    const env = {
      ASSETS: {
        fetch(request: Request): Promise<Response> {
          const pathname = new URL(request.url).pathname;
          if (pathname === '/google9a27f9c75cdae2dc.html') {
            return Promise.resolve(
              new Response(null, {
                status: 308,
                headers: { location: 'https://seald.nromomentum.com/google9a27f9c75cdae2dc' },
              }),
            );
          }
          if (pathname === '/google9a27f9c75cdae2dc') {
            return Promise.resolve(
              new Response(token, {
                status: 200,
                headers: { 'content-type': 'text/html; charset=utf-8', etag: '"gsc"' },
              }),
            );
          }
          if (pathname === '/') {
            return Promise.resolve(
              new Response(HOME, {
                status: 200,
                headers: { 'content-type': 'text/html; charset=utf-8', etag: '"home"' },
              }),
            );
          }
          return Promise.resolve(
            new Response(MISSING, { status: 200, headers: { etag: '"missing"' } }),
          );
        },
      },
    };
    const response = await worker.fetch(
      new Request('https://seald.nromomentum.com/google9a27f9c75cdae2dc.html'),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(response.headers.get('location')).toBeNull();
    expect(await response.text()).toBe(token);
  });

  it('serves robots.txt that allows crawling and names no sitemap', async () => {
    const { env, fetched } = site();
    const response = await worker.fetch(
      new Request('https://seald.nromomentum.com/robots.txt'),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    const body = await response.text();
    expect(body).toBe(robotsTxt());
    expect(body).toBe(QUIET_ROBOTS_TXT);
    expect(body).toMatch(/User-agent: \*\nAllow: \/\n/);
    expect(body).not.toMatch(/^Disallow:/m);
    expect(body).not.toMatch(/^Sitemap:/m);
    expect(body).not.toContain('Disallow: /');
    expect(fetched).toEqual([]);
  });

  it('does not serve indexing.config.js', async () => {
    const { env, fetched } = assetsFrom({
      '/': { body: HOME, contentType: 'text/html; charset=utf-8', etag: '"home"' },
      '/404': { body: MISSING, contentType: 'text/html; charset=utf-8', etag: '"missing"' },
      '/indexing.config.js': {
        body: 'export const SEO_INDEXING_ENABLED = false;\n// trademark unresolved\n',
        contentType: 'text/javascript; charset=utf-8',
        etag: '"cfg"',
      },
    });
    const response = await worker.fetch(
      new Request('https://seald.nromomentum.com/indexing.config.js'),
      env,
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    const body = await response.text();
    expect(body).toContain('Page not found');
    expect(body).not.toMatch(/trademark/i);
    expect(body).not.toContain('SEO_INDEXING_ENABLED');
    expect(fetched).not.toContain('/indexing.config.js');
  });

  it('does not serve sitemap.xml or llms.txt', async () => {
    for (const path of ['/sitemap.xml', '/sitemap-index.xml', '/llms.txt']) {
      const { env, fetched } = site();
      const response = await worker.fetch(new Request(`https://seald.nromomentum.com${path}`), env);
      expect(response.status, path).toBe(404);
      expect(response.headers.get('x-robots-tag'), path).toBe('noindex, nofollow');
      const body = await response.text();
      expect(body, path).not.toContain('<urlset');
      expect(body, path).not.toContain('<loc>');
      expect(body, path).not.toContain('# Seald');
      expect(body, path).toContain('Page not found');
      expect(fetched, path).not.toContain(path);
    }
  });
});

describe('apps/landing/_worker.js API hostname proxy', () => {
  const PROXY = {
    API_HOSTNAME: 'api.seald.nromomentum.com',
    API_PROXY_ORIGIN: 'https://ref.supabase.co/functions/v1/',
    EDGE_PROXY_SECRET: 's'.repeat(48),
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is inert until the API variables are set, and only for the API host', () => {
    const request = new Request('https://api.seald.nromomentum.com/health');
    expect(apiProxyUrl(request, {})).toBeNull();
    expect(apiProxyUrl(new Request('https://seald.nromomentum.com/health'), PROXY)).toBeNull();
    expect(apiProxyUrl(new Request('https://api.seald.nromomentum.com/a/b?x=1'), PROXY)).toBe(
      'https://ref.supabase.co/functions/v1/seald/a/b?x=1',
    );
  });

  it('forwards to the bridge with the proxy secret and the real client IP', async () => {
    const seen: Request[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init: RequestInit) => {
        seen.push(new Request(input, init));
        return new Response('{"ok":true}', { status: 201 });
      }),
    );
    const { env } = site();
    const response = await worker.fetch(
      new Request('https://api.seald.nromomentum.com/envelopes?draft=1', {
        method: 'POST',
        body: '{"title":"x"}',
        headers: {
          'content-type': 'application/json',
          'cf-connecting-ip': '203.0.113.7',
          // A client cannot pick its own IP or guess its way past the check.
          'x-seald-client-ip': '198.51.100.1',
          'x-seald-proxy-secret': 'forged',
        },
      }),
      { ...env, ...PROXY },
    );
    expect(response.status).toBe(201);
    const sent = seen[0]!;
    expect(sent.url).toBe('https://ref.supabase.co/functions/v1/seald/envelopes?draft=1');
    expect(sent.method).toBe('POST');
    expect(sent.headers.get('x-seald-client-ip')).toBe('203.0.113.7');
    expect(sent.headers.get('x-seald-proxy-secret')).toBe(PROXY.EDGE_PROXY_SECRET);
    expect(await sent.text()).toBe('{"title":"x"}');
  });

  it('answers 503 rather than proxying without the shared secret', async () => {
    const { env } = site();
    const response = await worker.fetch(new Request('https://api.seald.nromomentum.com/health'), {
      ...env,
      API_HOSTNAME: PROXY.API_HOSTNAME,
      API_PROXY_ORIGIN: PROXY.API_PROXY_ORIGIN,
    });
    expect(response.status).toBe(503);
  });
});
