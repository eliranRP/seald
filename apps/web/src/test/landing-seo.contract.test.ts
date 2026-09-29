import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MARKETING_PATHS } from '../../../landing/_worker.js';
import { toPublicPath } from '../../../landing/src/public-path.js';
import { renderSitemap } from '../../../landing/sitemap.js';

/**
 * Pins the S1a technical-SEO contract: public meta length, robots
 * allow-list, sitemap coverage, llms.txt, SPA noindex, and the
 * stable Organization graph. Body copy is out of scope.
 */

const LANDING = resolve(__dirname, '../../../landing');

const OVERCLAIMS = [
  'court-ready',
  'PAdES-LT',
  'long-term validation',
  'signing order',
  'in parallel or in order',
  'TLS 1.3',
  'AES-256',
  'Free e-signature',
];

function read(relativePath: string): string {
  return readFileSync(resolve(LANDING, relativePath), 'utf8');
}

function pageFile(pathname: string): string {
  if (pathname === '/') return 'src/pages/index.astro';
  return `src/pages${pathname}.astro`;
}

describe('landing SEO contract (S1a)', () => {
  it('gives every public page a 150–160 character description', () => {
    for (const pathname of MARKETING_PATHS) {
      const source = read(pageFile(pathname));
      const match = /description="([^"]+)"/.exec(source);
      expect(match, pathname).not.toBeNull();
      const description = match?.[1] ?? '';
      if (pathname === '/') continue;
      expect(description.length, `${pathname}: ${description}`).toBeGreaterThanOrEqual(150);
      expect(description.length, `${pathname}: ${description}`).toBeLessThanOrEqual(160);
    }
  });

  it('gives the 404 page a 150–160 character description and noindex', () => {
    const source = read('src/pages/404.astro');
    const match = /description="([^"]+)"/.exec(source);
    const description = match?.[1] ?? '';
    expect(description.length).toBeGreaterThanOrEqual(150);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(source).toContain('noindex={true}');
    expect(source).toContain('href="/signin"');
    expect(source).toContain('>Sign in<');
  });

  it('matches the homepage offer to the page and drops the dead pricing anchor', () => {
    const home = read('src/pages/index.astro');
    const title = /title="([^"]+)"/.exec(home)?.[1] ?? '';
    const description = /description="([^"]+)"/.exec(home)?.[1] ?? '';
    expect(title).toBe('Seald — Put your name to it.');
    expect(description).toBe(
      'Seald is a quieter way to sign, send, and store documents — built for the contracts you actually care about. PAdES digital seals with an RFC 3161 timestamp when a timestamp authority is reachable, plus a separate audit PDF.',
    );
    for (const claim of OVERCLAIMS) {
      expect(title, claim).not.toContain(claim);
      expect(description, claim).not.toContain(claim);
    }
    expect(home).not.toContain('#pricing');
    expect(home).not.toContain('>Pricing<');
  });

  it('builds extensionless canonical paths', () => {
    expect(toPublicPath('/index.html')).toBe('/');
    expect(toPublicPath('/contact.html')).toBe('/contact');
    expect(toPublicPath('/contact/')).toBe('/contact');
    expect(toPublicPath('/legal/privacy.html')).toBe('/legal/privacy');
    expect(toPublicPath('/legal/privacy/')).toBe('/legal/privacy');
    expect(toPublicPath('/')).toBe('/');
    const layout = read('src/layouts/BaseLayout.astro');
    expect(layout).toContain('toPublicPath');
    expect(layout).toContain('https://seald.nromomentum.com');
  });

  it('keeps one Organization graph named Seald, with a web-only app', () => {
    const layout = read('src/layouts/BaseLayout.astro');
    const frontmatter = layout.split('---')[1] ?? '';
    expect(frontmatter).toContain("name: 'Seald'");
    expect(frontmatter).not.toContain('legalName');
    expect(frontmatter).not.toContain('NRO Momentum');
    expect(frontmatter).not.toContain('PostalAddress');
    expect(frontmatter).toContain("operatingSystem: 'Web'");
    expect(frontmatter).toContain("applicationCategory: 'BusinessApplication'");
    expect(frontmatter).toContain('BreadcrumbList');
    expect(frontmatter).not.toContain('Seald, Inc.');
    expect(frontmatter).not.toContain('iOS');
    expect(frontmatter).not.toContain('Android');
    expect(frontmatter).not.toMatch(/sameAs\s*:/);
    expect(frontmatter).not.toMatch(/offers\s*:/);
    expect(frontmatter).toContain('PAdES seal (when a seal is applied)');
    expect(frontmatter).toContain('RFC 3161 timestamp (when available)');
    expect(frontmatter).toContain('SHA-256 audit chain');
    for (const claim of OVERCLAIMS) {
      expect(frontmatter, claim).not.toContain(claim);
    }
    expect(layout).not.toContain('sitemap-index.xml');
    expect(layout).not.toContain('rel="preload"');
    expect(layout).toContain('href="/sitemap.xml"');
    expect(layout).toContain('href="/favicon.ico"');
    expect(layout).toContain('og:image');
    expect(layout).toContain('twitter:card');
  });

  it('allows search and AI crawlers and disallows the app surface', () => {
    const robots = read('public/robots.txt');
    for (const bot of [
      'GPTBot',
      'OAI-SearchBot',
      'ChatGPT-User',
      'Google-Extended',
      'PerplexityBot',
      'ClaudeBot',
      'Bingbot',
    ]) {
      expect(robots).toContain(`User-agent: ${bot}`);
    }
    expect(robots).toContain('Allow: /');
    for (const path of [
      '/app$',
      '/app/',
      '/templates',
      '/settings/',
      '/m/',
      '/oauth/',
      '/sign/',
      '/document/',
      '/verify/',
      '/documents',
      '/signers',
      '/signin',
      '/signup',
      '/sent/',
    ]) {
      expect(robots).toContain(`Disallow: ${path}`);
    }
    expect(robots).toContain('Sitemap: https://seald.nromomentum.com/sitemap.xml');
    expect(robots).not.toMatch(/^Disallow: \/app$/m);
  });

  it('lists every public page in the sitemap with a build-time lastmod', () => {
    expect(existsSync(resolve(LANDING, 'public/sitemap.xml'))).toBe(false);
    const sitemap = renderSitemap(MARKETING_PATHS, '2026-01-02');
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1] ?? '');
    const lastmods = [...sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map(
      (match) => match[1] ?? '',
    );
    expect(locs).toHaveLength(MARKETING_PATHS.length);
    expect(lastmods).toHaveLength(MARKETING_PATHS.length);
    for (const pathname of MARKETING_PATHS) {
      const loc =
        pathname === '/'
          ? 'https://seald.nromomentum.com/'
          : `https://seald.nromomentum.com${pathname}`;
      expect(locs).toContain(loc);
    }
    expect(new Set(lastmods)).toEqual(new Set(['2026-01-02']));
    expect(sitemap).not.toContain('/signin');
    expect(sitemap).not.toContain('/404');
    expect(sitemap).not.toContain('google9a27f9c75cdae2dc');
    expect(read('astro.config.mjs')).toContain('buildLastmod()');
  });

  it('adds the Search Console meta tag and the exact verification file', () => {
    const layout = read('src/layouts/BaseLayout.astro');
    expect(layout).toContain(
      'name="google-site-verification" content="H_Xstu_43x0SSxeQggMkWFsRP9NaQEWEYwXau19TwaA"',
    );
    const file = readFileSync(resolve(LANDING, 'public/google9a27f9c75cdae2dc.html'));
    expect(file.length).toBe(53);
    expect(file.toString('utf8')).toBe('google-site-verification: google9a27f9c75cdae2dc.html');
    expect(existsSync(resolve(LANDING, 'public/google-site-verification.html'))).toBe(false);
  });

  it('describes Seald as a web app in llms.txt', () => {
    const llms = read('public/llms.txt');
    expect(llms).toMatch(/web application/i);
    expect(llms).toMatch(/no native app/i);
    expect(llms).not.toContain('NRO Momentum');
    expect(llms).not.toMatch(/Hartzdale|Camp Hill/i);
    expect(llms).not.toMatch(/iOS|Android|App Store|Google Play/i);
    expect(llms).toContain('https://seald.nromomentum.com/legal/privacy');
    expect(llms).toContain('PAdES seal (when a seal is applied)');
    expect(llms).toContain('RFC 3161 timestamp (when available)');
    expect(llms).toContain('SHA-256 audit chain');
    expect(llms).toContain('Free during beta');
    for (const claim of OVERCLAIMS) {
      expect(llms, claim).not.toContain(claim);
    }
  });
});

describe('SPA shell is noindex', () => {
  it('replaces the dev-harness title and sets a robots meta', () => {
    const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
    expect(html).toContain('<title>Seald</title>');
    expect(html).not.toContain('Dev Harness');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
  });
});
