import { useMemo, type ReactElement, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import type { Locale } from 'shared';
import { createI18n } from './init';
import { resolveLocale } from './resolveLocale';

export interface I18nProviderProps {
  readonly children: ReactNode;
  /** Override the resolved locale (tests; envelope locale in wave 5). */
  readonly locale?: Locale;
}

export function I18nProvider({ children, locale }: I18nProviderProps): ReactElement {
  const instance = useMemo(() => createI18n(locale ?? resolveLocale()), [locale]);
  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}
