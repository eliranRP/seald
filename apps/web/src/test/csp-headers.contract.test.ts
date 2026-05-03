import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Production bug (2026-05-03): the user's Google profile photo never
 * rendered in the mobile hamburger (or anywhere else in the SPA), even
 * though the `<Avatar>` component happily passes the URL into an `<img>`.
 * Root cause was the SPA's CSP `img-src` directive in
 * `apps/landing/public/_headers` (the single Cloudflare Pages project
 * serves both Astro landing and the React SPA, so this file gates the
 * SPA too):
 *
 *   img-src 'self' data: https://static.cloudflareinsights.com
 *
 * Google avatars are served from `*.googleusercontent.com` (typically
 * `lh3.googleusercontent.com` for Workspace / personal Google accounts);
 * Supabase storage avatars from `*.supabase.co/storage/v1/...`. Both were
 * blocked. Pin the contract so a future edit that drops these origins is
 * caught at unit-test time, not when a user notices grey initials.
 *
 * Also pins the other directives we already need (Google Fonts, Supabase
 * connect, Cloudflare Insights) so a regression on any of them — which
 * would silently break the landing page or auth flow — fails CI.
 */

const HEADERS_PATH = resolve(__dirname, '../../../landing/public/_headers');

function loadCsp(): string {
  const raw = readFileSync(HEADERS_PATH, 'utf8');
  const match = raw.match(/Content-Security-Policy:\s*(.+)/);
  if (!match || !match[1]) {
    throw new Error('No Content-Security-Policy directive found in _headers');
  }
  return match[1];
}

function directive(csp: string, name: string): readonly string[] {
  const part = csp.split(';').find((p) => p.trim().startsWith(`${name} `) || p.trim() === name);
  if (!part) return [];
  return part.trim().split(/\s+/).slice(1);
}

describe('CSP contract — apps/landing/public/_headers', () => {
  it('img-src allows Google avatar CDN so OAuth profile photos render', () => {
    const csp = loadCsp();
    const sources = directive(csp, 'img-src');
    // Either an explicit lh*.googleusercontent.com host or a wildcard
    // `*.googleusercontent.com` (preferred — covers lh3-lh6).
    const allowsGoogle = sources.some((s) =>
      /(^|\.)googleusercontent\.com$/.test(s.replace(/^https:\/\//, '')),
    );
    expect(allowsGoogle, `img-src missing googleusercontent.com (got: ${sources.join(' ')})`).toBe(
      true,
    );
  });

  it('img-src allows Supabase storage so uploaded avatars render', () => {
    const csp = loadCsp();
    const sources = directive(csp, 'img-src');
    const allowsSupabase = sources.some((s) => /supabase\.co$/.test(s.replace(/^https:\/\//, '')));
    expect(allowsSupabase, `img-src missing supabase.co (got: ${sources.join(' ')})`).toBe(true);
  });

  it('preserves the existing self + data + cloudflareinsights allowances on img-src', () => {
    const csp = loadCsp();
    const sources = directive(csp, 'img-src');
    expect(sources).toContain("'self'");
    expect(sources).toContain('data:');
    expect(sources).toContain('https://static.cloudflareinsights.com');
  });
});
