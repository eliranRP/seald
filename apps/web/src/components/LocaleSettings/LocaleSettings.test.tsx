import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { DEFAULT_SEND_REMINDER_SETTINGS } from '@/features/envelopes/sendReminderSettings';
import { renderWithTheme } from '@/test/renderWithTheme';
import { LocaleSettings } from './LocaleSettings';

type FlagHost = { __SEALD_FEATURE_OVERRIDES__?: Record<string, boolean> };
const setFlag = (on: boolean): void => {
  (globalThis as unknown as FlagHost).__SEALD_FEATURE_OVERRIDES__ = { i18n: on };
};

describe('LocaleSettings', () => {
  beforeEach(() => setFlag(true));
  afterEach(() => {
    delete (globalThis as unknown as FlagHost).__SEALD_FEATURE_OVERRIDES__;
  });

  it('renders nothing while i18n is off', () => {
    setFlag(false);
    renderWithTheme(
      <LocaleSettings value={DEFAULT_SEND_REMINDER_SETTINGS} onChange={() => undefined} />,
    );
    expect(screen.queryByRole('group', { name: 'Language' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Signer language' })).not.toBeInTheDocument();
  });

  it('shows English in a disabled select while it is the only locale', () => {
    renderWithTheme(
      <LocaleSettings value={DEFAULT_SEND_REMINDER_SETTINGS} onChange={() => undefined} />,
    );
    const select = screen.getByRole('combobox', { name: 'Signer language' });
    expect(select).toBeDisabled();
    expect(select).toHaveValue('en');
    expect(screen.getByRole('option', { name: 'English' })).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(
      <LocaleSettings value={DEFAULT_SEND_REMINDER_SETTINGS} onChange={() => undefined} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
