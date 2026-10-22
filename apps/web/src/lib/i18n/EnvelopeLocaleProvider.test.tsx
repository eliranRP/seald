import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import { EnvelopeLocaleProvider } from './EnvelopeLocaleProvider';

type FlagHost = { __SEALD_FEATURE_OVERRIDES__?: Record<string, boolean> };
const setFlag = (on: boolean): void => {
  (globalThis as unknown as FlagHost).__SEALD_FEATURE_OVERRIDES__ = { i18n: on };
};

function ActiveLanguage() {
  const { i18n } = useTranslation();
  return <p>language:{i18n.language}</p>;
}

describe('EnvelopeLocaleProvider', () => {
  afterEach(() => {
    delete (globalThis as unknown as FlagHost).__SEALD_FEATURE_OVERRIDES__;
  });

  it('uses the signer locale, then the envelope locale, with the flag on', () => {
    setFlag(true);
    render(
      <EnvelopeLocaleProvider signerLocale="en" envelopeLocale="xx">
        <ActiveLanguage />
      </EnvelopeLocaleProvider>,
    );
    expect(screen.getByText('language:en')).toBeInTheDocument();
  });

  it('falls back to the resolved locale for unsupported values', () => {
    setFlag(true);
    render(
      <EnvelopeLocaleProvider signerLocale="xx" envelopeLocale={null}>
        <ActiveLanguage />
      </EnvelopeLocaleProvider>,
    );
    expect(screen.getByText('language:en')).toBeInTheDocument();
  });

  it('ignores envelope and signer locales with the flag off', () => {
    setFlag(false);
    render(
      <EnvelopeLocaleProvider signerLocale="en" envelopeLocale="en">
        <ActiveLanguage />
      </EnvelopeLocaleProvider>,
    );
    expect(screen.getByText('language:en')).toBeInTheDocument();
  });
});
