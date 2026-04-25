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
]);

// Trailing slash matters: '/auth/' matches '/auth/foo' and '/auth' itself.
const SPA_PREFIXES = ['/auth/', '/debug/', '/verify/', '/sign/', '/document/'];

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
      // Server-side rewrite: fetch /app.html via the assets binding
      // but keep the original URL in the response so the client's
      // address bar doesn't change.
      const rewritten = new URL(request.url);
      rewritten.pathname = '/app.html';
      return env.ASSETS.fetch(new Request(rewritten.toString(), request));
    }
    return env.ASSETS.fetch(request);
  },
};
