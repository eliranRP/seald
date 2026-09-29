import { describe, expect, it } from 'vitest';
import worker, { isSpaRoute, MARKETING_PATHS } from '../../../landing/_worker.js';

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
  });
}

describe('apps/landing/_worker.js routing', () => {
  it('treats sent, app, and auth paths as the SPA', () => {
    expect(isSpaRoute('/sent/abc')).toBe(true);
    expect(isSpaRoute('/sent')).toBe(true);
    expect(isSpaRoute('/app')).toBe(true);
    expect(isSpaRoute('/signin')).toBe(true);
    expect(isSpaRoute('/settings/integrations')).toBe(true);
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
    for (const path of ['/signin', '/sent/abc', '/sent', '/app', '/templates', '/m/send']) {
      const { env, fetched } = site();
      const response = await worker.fetch(new Request(`https://seald.nromomentum.com${path}`), env);
      expect(response.status, path).toBe(200);
      expect(response.headers.get('x-robots-tag'), path).toBe('noindex, nofollow');
      expect(await response.text(), path).toBe(SPA);
      expect(fetched[0], path).toBe('/app');
    }
  });

  it('serves a marketing page at the extensionless path with status 200', async () => {
    const { env, fetched } = site();
    const response = await worker.fetch(new Request('https://seald.nromomentum.com/contact'), env);
    expect(response.status).toBe(200);
    expect(response.headers.get('x-robots-tag')).toBeNull();
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
    }
  });

  it('returns HTTP 404 with the not-found page for an unknown path', async () => {
    const { env, fetched } = site();
    const response = await worker.fetch(
      new Request('https://seald.nromomentum.com/nonexistent-xyz'),
      env,
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('x-robots-tag')).toBe('noindex');
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
    expect(await response.text()).toContain('Contact');
    expect(fetched).toEqual(['/contact', '/contact/']);
  });
});
