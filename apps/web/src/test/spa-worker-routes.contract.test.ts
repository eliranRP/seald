import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every path in AppRoutes.tsx must be served by the Cloudflare Pages
 * worker (`apps/landing/_worker.js`). A missing prefix returns the
 * landing HTML instead of the SPA shell.
 *
 * AppRoutes.tsx is the only list of React routes. A worker path that
 * is not one of those routes is still accepted when it comes from the
 * worker itself:
 *
 * - The SPA HTML shell is `rewritten.pathname = '...'` in `_worker.js`
 *   (`/app`). Listing that same path in `SPA_EXACT` is not an orphan.
 * - A `SPA_PREFIXES` entry is in scope when an AppRoutes pattern has
 *   that path segment. `/sent/` matches `/document/:id/sent`.
 *
 * Anything else goes in `LEGACY_EXACT` below, with a comment that says
 * why it is not an AppRoutes path. `/contacts` is the only one: the
 * contacts UI is `/signers`, and the worker still keeps that URL on
 * the SPA shell.
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

function shellPath(workerSource: string): string | undefined {
  const match = workerSource.match(/rewritten\.pathname\s*=\s*'([^']+)'/);
  return match?.[1];
}

function literalSegments(pattern: string): string[] {
  return pattern.split('/').filter((part) => part.length > 0 && !part.startsWith(':'));
}

function prefixNamedInRoutes(prefix: string, patterns: readonly string[]): boolean {
  const name = prefix.replace(/^\/+|\/+$/g, '');
  if (name.length === 0 || name.includes('/')) return false;
  return patterns.some((pattern) => literalSegments(pattern).includes(name));
}

function orphanExact(
  exact: readonly string[],
  samples: readonly string[],
  shell: string | undefined,
): string[] {
  return exact.filter(
    (path) =>
      !LEGACY_EXACT.includes(path as (typeof LEGACY_EXACT)[number]) &&
      path !== shell &&
      !samples.includes(path),
  );
}

function orphanPrefixes(prefixes: readonly string[], patterns: readonly string[]): string[] {
  const samples = patterns.map(sample);
  return prefixes.filter(
    (prefix) =>
      !samples.some((pathname) => covered(pathname, [], [prefix])) &&
      !prefixNamedInRoutes(prefix, patterns),
  );
}

describe('AppRoutes and landing worker route parity', () => {
  const routeSource = readFileSync(APP_ROUTES, 'utf8');
  const workerSource = readFileSync(WORKER, 'utf8');
  const worker = loadWorker(workerSource);
  const patterns = routePatterns(routeSource);
  const samples = patterns.map(sample);
  const shell = shellPath(workerSource);

  it('covers every AppRoutes path from SPA_EXACT or SPA_PREFIXES', () => {
    const missing = patterns.filter(
      (pattern) => !covered(sample(pattern), worker.exact, worker.prefixes),
    );
    expect(missing).toEqual([]);
  });

  it('rejects a worker exact path that is not an AppRoutes path, the shell, or /contacts', () => {
    expect(orphanExact(worker.exact, samples, shell)).toEqual([]);
  });

  it('rejects a worker prefix that matches no AppRoutes path or segment', () => {
    expect(orphanPrefixes(worker.prefixes, patterns)).toEqual([]);
  });

  it('accepts /app and /sent/ from AppRoutes and the shell rewrite', () => {
    const withShellRoutes = {
      exact: [...worker.exact, '/app'],
      prefixes: [...worker.prefixes, '/sent/'],
    };
    expect(orphanExact(withShellRoutes.exact, samples, shell)).toEqual([]);
    expect(orphanPrefixes(withShellRoutes.prefixes, patterns)).toEqual([]);
    expect(shell).toBe('/app');
  });
});
