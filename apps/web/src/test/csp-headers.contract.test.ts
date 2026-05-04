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

  /**
   * Production bug (2026-05-04): after a user signed, the optimistic
   * signature preview rendered through `URL.createObjectURL(blob)` in
   * `useSigning.ts` was blocked by CSP — the network panel showed
   * `blob:https://seald.nromomentum.com/...` as `(blocked:csp)`. Our
   * `img-src` allowed `data:` but not `blob:`. Pin the allowance so a
   * future tightening that drops `blob:` re-breaks the signature
   * preview at unit-test time, not on prod.
   *
   * blob: URLs are same-origin object URLs — they cannot leak data
   * cross-origin and are widely accepted as safe for img-src.
   */
  it('img-src allows blob: so optimistic signature previews render', () => {
    const csp = loadCsp();
    const sources = directive(csp, 'img-src');
    expect(sources).toContain('blob:');
  });

  /**
   * Production bug (2026-05-04): with the Drive picker backend wired
   * up and `GDRIVE_PICKER_DEVELOPER_KEY`/`GDRIVE_PICKER_APP_ID` loaded
   * on the API host, end users still saw "Couldn't load Google's
   * Drive picker — The Google picker library failed to load." The
   * SPA's CSP `script-src 'self' https://static.cloudflareinsights.com`
   * blocked `https://apis.google.com/js/api.js` (the bootstrap script
   * `useGoogleApi` injects), the `connect-src` blocked the Picker /
   * Drive API XHRs, and `default-src 'self'` (no `frame-src`
   * override) blocked the picker's iframe at `docs.google.com`. Pin
   * the contract so a future tightening that re-breaks any of these
   * fails CI here, not on prod.
   */
  describe('Drive picker allowances', () => {
    it('script-src allows https://apis.google.com so gapi loader can fetch /js/api.js', () => {
      const csp = loadCsp();
      const sources = directive(csp, 'script-src');
      expect(sources).toContain('https://apis.google.com');
    });

    it('connect-src allows Google APIs so picker can reach Drive + Picker endpoints', () => {
      const csp = loadCsp();
      const sources = directive(csp, 'connect-src');
      const allowsGoogleApis = sources.some(
        (s) => s === 'https://www.googleapis.com' || s === 'https://*.googleapis.com',
      );
      expect(
        allowsGoogleApis,
        `connect-src missing googleapis.com host (got: ${sources.join(' ')})`,
      ).toBe(true);
      expect(sources).toContain('https://content.googleapis.com');
    });

    it('frame-src allows https://docs.google.com so the picker iframe renders', () => {
      const csp = loadCsp();
      const sources = directive(csp, 'frame-src');
      expect(sources).toContain('https://docs.google.com');
      expect(sources).toContain('https://accounts.google.com');
    });
  });
});
