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
// See https://developers.cloudflare.com/pages/configuration/_routes/

const SPA_EXACT = new Set([
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
];

function isSpaRoute(pathname) {
  if (SPA_EXACT.has(pathname)) return true;
  for (const prefix of SPA_PREFIXES) {
    if (pathname === prefix.slice(0, -1)) return true;
    if (pathname.startsWith(prefix)) return true;
  }
  return false;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (isSpaRoute(url.pathname)) {
      // Server-side rewrite. Fetch `/app` (NOT `/app.html`) via the
      // assets binding: CF Pages auto-strips `.html` from served
      // paths, and that strip happens even inside env.ASSETS.fetch —
      // requesting `/app.html` returns a 308 to `/app` which would
      // leak back to the client and change the address bar. Hitting
      // `/app` directly skips the strip and returns the SPA HTML.
      const rewritten = new URL(request.url);
      rewritten.pathname = '/app';
      return env.ASSETS.fetch(new Request(rewritten.toString(), request));
    }
    return env.ASSETS.fetch(request);
  },
};
