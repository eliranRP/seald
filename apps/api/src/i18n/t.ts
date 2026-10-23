import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DEFAULT_LOCALE, LOCALE_NAMESPACES, matchSupportedLocale, type Locale } from 'shared';

/**
 * Server-side string lookup (WP-38), used by the certificate and other
 * server-rendered artifacts. Catalogs are the same JSON files the SPA
 * uses: `packages/shared/locales/<lng>/<ns>.json`.
 *
 * Keys are dotted paths in the `common` namespace (e.g.
 * `server.certificate.title`), or `<ns>:<path>` for another namespace.
 * Lookup falls back locale -> `en` -> the key itself (never throws, so a
 * missing string degrades a document instead of failing a seal).
 *
 * Legal / consent strings are NOT served from catalogs (decision D2b).
 */

type Catalog = { readonly [key: string]: string | Catalog };

function localesRoot(): string {
  // `shared` resolves to <pkg>/dist/index.js (commonjs) in both src and dist runs.
  return resolve(dirname(require.resolve('shared')), '..', 'locales');
}

const cache = new Map<string, Catalog>();

function isCatalog(value: unknown): value is Catalog {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function loadCatalog(locale: Locale, ns: string): Catalog {
  const cacheKey = `${locale}:${ns}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  let catalog: Catalog = {};
  if ((LOCALE_NAMESPACES as readonly string[]).includes(ns)) {
    const file = resolve(localesRoot(), locale, `${ns}.json`);
    if (existsSync(file)) {
      const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
      if (isCatalog(parsed)) catalog = parsed;
    }
  }
  cache.set(cacheKey, catalog);
  return catalog;
}

function lookup(catalog: Catalog, path: string): string | undefined {
  let node: string | Catalog | undefined = catalog;
  for (const part of path.split('.')) {
    if (!isCatalog(node)) return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/** Translate `key` for `locale`; unknown locale tags resolve via primary subtag, then `en`. */
export function t(locale: string | null | undefined, key: string): string {
  const resolved = matchSupportedLocale(locale) ?? DEFAULT_LOCALE;
  const sep = key.indexOf(':');
  const ns = sep === -1 ? 'common' : key.slice(0, sep);
  const path = sep === -1 ? key : key.slice(sep + 1);
  return (
    lookup(loadCatalog(resolved, ns), path) ?? lookup(loadCatalog(DEFAULT_LOCALE, ns), path) ?? key
  );
}
