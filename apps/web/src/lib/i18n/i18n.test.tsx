import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider, resolveLocale, useT } from '.';

function Probe() {
  const t = useT();
  return <p>{t('guestBadge.label')}</p>;
}

interface Host {
  __SEALD_FEATURE_OVERRIDES__?: Record<string, boolean>;
}

function setFlag(on: boolean | undefined): void {
  const host = globalThis as unknown as Host;
  if (on === undefined) delete host.__SEALD_FEATURE_OVERRIDES__;
  else host.__SEALD_FEATURE_OVERRIDES__ = { i18n: on };
}

function setLanguage(lang: string): void {
  Object.defineProperty(window.navigator, 'language', { value: lang, configurable: true });
  Object.defineProperty(window.navigator, 'languages', { value: [lang], configurable: true });
}

describe('i18n', () => {
  afterEach(() => {
    setFlag(undefined);
    setLanguage('en-US');
  });

  it('resolves en when the flag is off, whatever the browser says', () => {
    setFlag(false);
    setLanguage('he-IL');
    expect(resolveLocale()).toBe('en');
  });

  it('matches navigator.language by primary subtag when the flag is on', () => {
    setFlag(true);
    setLanguage('en-GB');
    expect(resolveLocale()).toBe('en');
  });

  it('falls back to en for unsupported languages when the flag is on', () => {
    setFlag(true);
    setLanguage('fr-FR');
    expect(resolveLocale()).toBe('en');
  });

  it('translates through the provider', () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByText('Guest mode')).toBeInTheDocument();
  });

  it('translates without a provider (default instance)', () => {
    render(<Probe />);
    expect(screen.getByText('Guest mode')).toBeInTheDocument();
  });
});
