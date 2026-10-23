import type { ReactElement, ReactNode } from 'react';
import { isFeatureEnabled, matchSupportedLocale } from 'shared';
import { I18nProvider } from './I18nProvider';

export interface EnvelopeLocaleProviderProps {
  readonly children: ReactNode;
  /** The signer's own locale; wins over the envelope's. */
  readonly signerLocale?: string | null | undefined;
  /** The envelope's locale. */
  readonly envelopeLocale?: string | null | undefined;
}

/**
 * Locale for the signing experience (WP-38): signer locale, then envelope
 * locale, then the browser-resolved one (`resolveLocale`). With the `i18n`
 * flag off the envelope and signer locales are ignored, so nothing changes.
 */
export function EnvelopeLocaleProvider({
  children,
  signerLocale,
  envelopeLocale,
}: EnvelopeLocaleProviderProps): ReactElement {
  const locale = isFeatureEnabled('i18n')
    ? (matchSupportedLocale(signerLocale) ?? matchSupportedLocale(envelopeLocale))
    : undefined;
  return <I18nProvider {...(locale !== undefined ? { locale } : {})}>{children}</I18nProvider>;
}
