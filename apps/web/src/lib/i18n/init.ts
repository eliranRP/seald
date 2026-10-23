import { createInstance, type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LOCALE, type Locale } from 'shared';
import enCommon from 'shared/locales/en/common.json';

/**
 * Bundled catalogs, keyed by locale then namespace. Adding a locale means
 * dropping `packages/shared/locales/<lng>/*.json` and registering it here
 * and in `SUPPORTED_LOCALES`.
 */
export const resources = {
  en: { common: enCommon },
} as const;

export type CommonCatalog = typeof enCommon;

export function createI18n(lng: Locale): I18nInstance {
  const instance = createInstance();
  void instance.use(initReactI18next).init({
    resources,
    lng,
    fallbackLng: DEFAULT_LOCALE,
    defaultNS: 'common',
    ns: ['common'],
    interpolation: { escapeValue: false },
    // Resources are bundled, so init completes synchronously.
    initAsync: false,
    react: { useSuspense: false },
  });
  return instance;
}

/**
 * App-wide default instance. Importing this module registers it with
 * react-i18next, so `useT()` works without a provider (unit tests).
 */
export const i18n: I18nInstance = createI18n(DEFAULT_LOCALE);
