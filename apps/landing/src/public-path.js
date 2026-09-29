/**
 * `build.format: 'file'` makes Astro.url.pathname `/contact.html` at
 * build time. Cloudflare serves that file at `/contact` (200). Canonical
 * and og:url must be the extensionless URL, or they point at a 308.
 */
export function toPublicPath(pathname) {
  let path = pathname;
  if (path.endsWith('/index.html')) {
    path = path.slice(0, -'/index.html'.length);
  } else if (path.endsWith('.html')) {
    path = path.slice(0, -'.html'.length);
  }
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  if (path === '') path = '/';
  return path;
}
