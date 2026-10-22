/**
 * Locale registry (WP-38). Catalogs live in `packages/shared/locales/<lng>/*.json`
 * and are loaded by the web (`apps/web/src/lib/i18n`) and the api
 * (`apps/api/src/i18n`). English only for now: adding a locale is a
 * catalog drop-in plus an entry here.
 *
 * Legal and consent strings (`product-claims.ts`, ESIGN disclosure, terms)
 * are NEVER catalog-translated; they stay English in every locale.
 */
export const SUPPORTED_LOCALES = ['en'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** Catalog namespaces shipped under `locales/<lng>/<ns>.json`. */
export const LOCALE_NAMESPACES = ['common'] as const;

export type LocaleNamespace = (typeof LOCALE_NAMESPACES)[number];

export function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Map a BCP-47 tag (e.g. `en-US`, `he_IL`) onto a supported locale by
 * primary subtag, or `undefined` when unsupported.
 */
export function matchSupportedLocale(tag: string | null | undefined): Locale | undefined {
  if (!tag) return undefined;
  const primary = tag.toLowerCase().split(/[-_]/)[0] ?? '';
  return isSupportedLocale(primary) ? primary : undefined;
}
