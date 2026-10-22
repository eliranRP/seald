import { DEFAULT_LOCALE, isFeatureEnabled, matchSupportedLocale, type Locale } from 'shared';

/**
 * Pick the UI locale. With the `i18n` flag off this is always `en`
 * (zero visible change). With it on: `navigator.language` (then the rest
 * of `navigator.languages`) -> supported list -> `en`.
 */
export function resolveLocale(): Locale {
  if (!isFeatureEnabled('i18n')) return DEFAULT_LOCALE;
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE;
  const candidates = [navigator.language, ...(navigator.languages ?? [])];
  for (const tag of candidates) {
    const match = matchSupportedLocale(tag);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}
