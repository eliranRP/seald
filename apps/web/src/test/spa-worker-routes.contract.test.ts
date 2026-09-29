import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every path in AppRoutes.tsx must be served by the Cloudflare Pages
 * worker (`apps/landing/_worker.js`). A missing prefix returns the
 * landing HTML instead of the SPA shell.
 *
 * `/contacts` is still an exact worker path. The SPA has no such route
 * (the contacts UI is `/signers`); the worker entry keeps that URL on
 * the SPA shell. It is the only legacy exact path. Do not add another.
 */

const APP_ROUTES = resolve(__dirname, '../AppRoutes.tsx');
const WORKER = resolve(__dirname, '../../../landing/_worker.js');
const LEGACY_EXACT = ['/contacts'] as const;

function quoted(block: string): string[] {
  return [...block.matchAll(/'([^']+)'/g)].map((match) => match[1] ?? '');
}

function loadWorker(source: string): { exact: string[]; prefixes: string[] } {
  const exact = source.match(/const SPA_EXACT = new Set\(\[([\s\S]*?)\]\)/);
  const prefixes = source.match(/const SPA_PREFIXES = \[([\s\S]*?)\]/);
  if (!exact?.[1] || !prefixes?.[1]) {
    throw new Error('SPA_EXACT or SPA_PREFIXES is missing from _worker.js');
  }
  return { exact: quoted(exact[1]), prefixes: quoted(prefixes[1]) };
}

function routePatterns(source: string): string[] {
  return [...source.matchAll(/path="([^"]+)"/g)]
    .map((match) => match[1] ?? '')
    .filter((pattern) => pattern.length > 0 && pattern !== '*');
}

function sample(pattern: string): string {
  return pattern.replace(/:[^/]+/g, 'x');
}

function covered(pathname: string, exact: readonly string[], prefixes: readonly string[]): boolean {
  if (exact.includes(pathname)) return true;
  return prefixes.some((prefix) => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix));
}

describe('AppRoutes and landing worker route parity', () => {
  const routes = readFileSync(APP_ROUTES, 'utf8');
  const worker = loadWorker(readFileSync(WORKER, 'utf8'));
  const patterns = routePatterns(routes);
  const samples = patterns.map(sample);

  it('covers every AppRoutes path from SPA_EXACT or SPA_PREFIXES', () => {
    const missing = patterns.filter(
      (pattern) => !covered(sample(pattern), worker.exact, worker.prefixes),
    );
    expect(missing).toEqual([]);
  });

  it('rejects a worker exact path the SPA does not declare, except legacy /contacts', () => {
    const orphans = worker.exact.filter(
      (path) =>
        !LEGACY_EXACT.includes(path as (typeof LEGACY_EXACT)[number]) && !samples.includes(path),
    );
    expect(orphans).toEqual([]);
  });

  it('rejects a worker prefix that matches no AppRoutes path', () => {
    const orphans = worker.prefixes.filter(
      (prefix) => !samples.some((pathname) => covered(pathname, [], [prefix])),
    );
    expect(orphans).toEqual([]);
  });
});
