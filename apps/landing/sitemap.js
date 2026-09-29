/**
 * Public sitemap. `lastmod` is the UTC build date so the file in dist
 * does not carry a date that was committed by hand.
 */
export function buildLastmod(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function renderSitemap(paths, lastmod, origin = 'https://seald.nromomentum.com') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastmod)) {
    throw new Error(`sitemap lastmod must be YYYY-MM-DD, received ${lastmod}`);
  }
  const urls = paths.map((pathname) => {
    const loc = pathname === '/' ? `${origin}/` : `${origin}${pathname}`;
    return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}
