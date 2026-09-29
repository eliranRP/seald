import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Security sentences on the public legal pages. Cipher names, a TLS
 * version, and a long-term validation profile are not enforced by
 * Caddy, the Dockerfile, or the storage client.
 */
const LANDING_LEGAL = resolve(__dirname, '../../../landing/src/pages/legal');

const PAGES = ['dpa.astro', 'terms.astro', 'privacy.astro'] as const;

const RETIRED_CLAIMS = [
  'AES-256',
  'TLS 1.3',
  'PAdES-LT',
  'PAdES-LTV',
  'long-term-validation',
  'long-term validation',
  'ETSI EN 319 142',
] as const;

describe('legal page security claims', () => {
  it.each(PAGES)('%s drops cipher, TLS version, and long-term validation claims', (file) => {
    const source = readFileSync(resolve(LANDING_LEGAL, file), 'utf8');
    for (const claim of RETIRED_CLAIMS) {
      expect(source, claim).not.toContain(claim);
    }
    expect(source).toContain(
      'encrypted in transit using TLS and at rest by our infrastructure providers',
    );
    expect(source).toContain('PAdES seal when applied');
    expect(source).toContain('RFC 3161 timestamp when available');
  });
});
