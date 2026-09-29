// Cloudflare Pages worker — single-file form. Copied to the deploy
// root by .github/workflows/deploy-cloudflare.yml. Takes precedence
// over static asset serving; we explicitly fall through to env.ASSETS
// for anything that isn't a SPA route.
//
// Why this exists: CF Pages does NOT support 200-status rewrites in
// `_redirects` (they get coerced to 308 redirects). The email CTA
// flow needs to keep `/sign/<id>`, `/verify/<id>`, `/signin`, etc.
// in the address bar while serving the SPA's HTML shell. A worker
// is the documented escape hatch.
//
// SEO (cycle S1a):
//   - Marketing pages are extensionless (`/contact`, not `/contact/`).
//     Trailing-slash and `.html` aliases 308 to that canonical.
//   - Unknown paths return `/404` with HTTP 404. They must not fall
//     through to the homepage (CF's SPA-style 200 fallback).
//   - SPA shells get `X-Robots-Tag: noindex, nofollow`.
//
// See https://developers.cloudflare.com/pages/configuration/_routes/

const SPA_EXACT = new Set([
  '/app',
  '/signin',
  '/signup',
  '/forgot-password',
  '/check-email',
  '/documents',
  '/signers',
  '/contacts',
  '/templates',
]);

// Trailing slash matters: '/auth/' matches '/auth/foo' and '/auth' itself.
// `/settings/` was added 2026-05-03 with WT-B (Drive integration page) —
// red-flag row 1 from the gdrive-feature plan, same root cause as the
// 2026-05-02 outage where missing prefixes silently served the landing
// HTML instead of rewriting to the SPA shell. Pinned by
// `apps/web/src/routes/settings/integrations/_worker-spa-routing.test.ts`.
// `/oauth/` was added 2026-05-04 with Bug G (Drive OAuth popup-bridge
// route mounted outside AppShell to bypass the mobile-redirect rule).
// Pinned by
// `apps/web/src/pages/GDriveOAuthCallbackPage/_worker-spa-routing.test.ts`.
// `/sent/` is the post-send confirmation prefix. The React tree mounts
// the screen at `/document/:id/sent` (already covered by `/document/`);
// `/sent/:id` is still requested in the wild and must not serve the
// marketing homepage.
const SPA_PREFIXES = [
  '/auth/',
  '/debug/',
  '/verify/',
  '/sign/',
  '/document/',
  '/templates/',
  '/m/',
  '/settings/',
  '/oauth/',
  '/sent/',
];

/**
 * Public marketing URLs. Canonical form has no trailing slash and no
 * `.html`. The build writes `dist/sitemap.xml` from this list.
 */
export const MARKETING_PATHS = [
  '/',
  '/contact',
  '/dsar',
  '/legal/privacy',
  '/legal/terms',
  '/legal/cookies',
  '/legal/dpa',
  '/legal/aup',
  '/legal/accessibility',
  '/legal/esign-disclosure',
  '/legal/imprint',
  '/legal/responsible-disclosure',
  '/legal/sub-processors',
];

const MARKETING = new Set(MARKETING_PATHS);

// Google Search Console HTML-file verification. The URL must stay
// `/google9a27f9c75cdae2dc.html` (200). It is not a marketing page, so
// it is not in the sitemap, and it must not fall through to the SPA
// shell or the soft-404 homepage.
const GSC_VERIFICATION_FILE = '/google9a27f9c75cdae2dc.html';

export function isSpaRoute(pathname) {
  if (SPA_EXACT.has(pathname)) return true;
  for (const prefix of SPA_PREFIXES) {
    if (pathname === prefix.slice(0, -1)) return true;
    if (pathname.startsWith(prefix)) return true;
  }
  return false;
}

// Cloudflare applies public/_headers to asset responses. Worker-built
// redirects never pass through that file, so the same `/*` directives
// are set here. Keep the two lists identical.
const SECURITY_HEADERS = {
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Content-Security-Policy':
    "default-src 'self'; base-uri 'self'; form-action 'self' mailto:; frame-ancestors 'self'; img-src 'self' data: blob: https://static.cloudflareinsights.com https://*.googleusercontent.com https://*.gstatic.com https://*.supabase.co; script-src 'self' https://static.cloudflareinsights.com https://apis.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://cloudflareinsights.com https://*.supabase.co https://api.seald.nromomentum.com https://www.googleapis.com https://content.googleapis.com; frame-src 'self' https://docs.google.com https://accounts.google.com; object-src 'none'; upgrade-insecure-requests",
};

function redirect(request, pathname) {
  const dest = new URL(request.url);
  dest.pathname = pathname;
  const headers = new Headers(SECURITY_HEADERS);
  headers.set('Location', dest.toString());
  return new Response(null, { status: 308, headers });
}

function isHtmlResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  return contentType.toLowerCase().includes('text/html');
}

function extensionlessHtml(pathname) {
  if (!pathname.endsWith('.html')) return null;
  if (pathname === '/index.html') return '/';
  const stripped = pathname.slice(0, -'.html'.length);
  return stripped === '' ? '/' : stripped;
}

/**
 * Cloudflare's asset layer serves `index.html` with status 200 for
 * unknown paths when no 404 page is configured (or when the project
 * is in single-page-application not-found mode). That is a soft 404.
 * A real file has its own body; the homepage fallback matches `/`.
 */
async function isHomepageFallback(request, response, env) {
  if (response.status !== 200 || !isHtmlResponse(response)) return false;
  const indexUrl = new URL(request.url);
  indexUrl.pathname = '/';
  indexUrl.search = '';
  const indexResponse = await env.ASSETS.fetch(new Request(indexUrl.toString(), { method: 'GET' }));
  const etag = response.headers.get('etag');
  const indexEtag = indexResponse.headers.get('etag');
  if (etag && indexEtag) return etag === indexEtag;
  const [pageBody, indexBody] = await Promise.all([
    response.clone().text(),
    indexResponse.text(),
  ]);
  return pageBody === indexBody;
}

async function notFound(request, env) {
  const pageUrl = new URL(request.url);
  pageUrl.pathname = '/404';
  pageUrl.search = '';
  // Fetch `/404` (not `/404.html`). CF Pages strips `.html` inside
  // `env.ASSETS.fetch` and would 308 `/404.html` → `/404`.
  let page = await env.ASSETS.fetch(new Request(pageUrl.toString(), { method: 'GET' }));
  if (page.status >= 300 && page.status < 400) {
    const location = page.headers.get('location');
    if (location) {
      const follow = new URL(location, pageUrl);
      page = await env.ASSETS.fetch(new Request(follow.toString(), { method: 'GET' }));
    }
  }
  const headers = new Headers(page.headers);
  headers.set('X-Robots-Tag', 'noindex');
  return new Response(page.body, {
    status: 404,
    statusText: 'Not Found',
    headers,
  });
}

async function spaShell(request, env) {
  // Server-side rewrite. Fetch `/app` (NOT `/app.html`) via the
  // assets binding: CF Pages auto-strips `.html` from served
  // paths, and that strip happens even inside env.ASSETS.fetch —
  // requesting `/app.html` returns a 308 to `/app` which would
  // leak back to the client and change the address bar. Hitting
  // `/app` directly skips the strip and returns the SPA HTML.
  const rewritten = new URL(request.url);
  rewritten.pathname = '/app';
  const asset = await env.ASSETS.fetch(new Request(rewritten.toString(), request));
  const headers = new Headers(asset.headers);
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(asset.body, {
    status: asset.status,
    statusText: asset.statusText,
    headers,
  });
}

async function verificationFile(request, env) {
  const fileUrl = new URL(request.url);
  fileUrl.pathname = GSC_VERIFICATION_FILE;
  fileUrl.search = '';
  let asset = await env.ASSETS.fetch(new Request(fileUrl.toString(), { method: 'GET' }));
  // CF Pages strips `.html` inside ASSETS.fetch and 308s to the
  // extensionless path. Follow that once and answer 200 here so
  // Google fetches the file at the `.html` URL.
  if (asset.status >= 300 && asset.status < 400) {
    const location = asset.headers.get('location');
    if (location) {
      const followUrl = new URL(location, fileUrl);
      if (followUrl.origin === fileUrl.origin) {
        const followed = await env.ASSETS.fetch(new Request(followUrl.toString(), { method: 'GET' }));
        if (followed.ok && !(await isHomepageFallback(request, followed, env))) {
          const headers = new Headers(followed.headers);
          return new Response(followed.body, {
            status: 200,
            statusText: 'OK',
            headers,
          });
        }
      }
    }
  }
  if (asset.ok && !(await isHomepageFallback(request, asset, env))) {
    return asset;
  }
  return notFound(request, env);
}

async function marketingPage(request, env) {
  const asset = await env.ASSETS.fetch(request);
  // If the asset pipeline still wants a trailing slash, follow it
  // internally so the extensionless canonical returns 200.
  if (asset.status >= 300 && asset.status < 400) {
    const location = asset.headers.get('location');
    if (location) {
      const followUrl = new URL(location, request.url);
      if (followUrl.origin === new URL(request.url).origin) {
        const followed = await env.ASSETS.fetch(new Request(followUrl.toString(), request));
        if (followed.ok) {
          const headers = new Headers(followed.headers);
          return new Response(followed.body, {
            status: 200,
            statusText: 'OK',
            headers,
          });
        }
      }
    }
  }
  return asset;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === '/404' || pathname === '/404.html' || pathname === '/404/') {
      return notFound(request, env);
    }

    if (isSpaRoute(pathname)) {
      return spaShell(request, env);
    }

    if (
      pathname === GSC_VERIFICATION_FILE ||
      pathname === '/google9a27f9c75cdae2dc'
    ) {
      return verificationFile(request, env);
    }

    if (pathname === '/index.html') {
      return redirect(request, '/');
    }

    const htmlAlias = extensionlessHtml(pathname);
    if (htmlAlias && MARKETING.has(htmlAlias)) {
      return redirect(request, htmlAlias);
    }

    if (pathname.length > 1 && pathname.endsWith('/')) {
      const stripped = pathname.replace(/\/+$/, '');
      if (MARKETING.has(stripped)) {
        return redirect(request, stripped);
      }
    }

    if (MARKETING.has(pathname)) {
      return marketingPage(request, env);
    }

    const asset = await env.ASSETS.fetch(request);
    if (asset.status === 404 || (await isHomepageFallback(request, asset, env))) {
      return notFound(request, env);
    }
    return asset;
  },
};
