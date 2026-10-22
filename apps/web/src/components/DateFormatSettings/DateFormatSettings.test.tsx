import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { DEFAULT_SEND_REMINDER_SETTINGS } from '@/features/envelopes/sendReminderSettings';
import type { SendReminderSettings } from '@/features/envelopes/sendReminderSettings';
import { renderWithTheme } from '@/test/renderWithTheme';
import { DateFormatSettings } from './DateFormatSettings';

type FlagHost = { __SEALD_FEATURE_OVERRIDES__?: Record<string, boolean> };
const setFlag = (on: boolean): void => {
  (globalThis as unknown as FlagHost).__SEALD_FEATURE_OVERRIDES__ = { fieldMetaV2: on };
};

const NOW = Date.parse('2026-10-22T23:30:00.000Z');

function Harness({ onChange }: { readonly onChange?: (v: SendReminderSettings) => void }) {
  const [value, setValue] = useState<SendReminderSettings>(DEFAULT_SEND_REMINDER_SETTINGS);
  return (
    <DateFormatSettings
      value={value}
      nowMs={NOW}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe('DateFormatSettings', () => {
  beforeEach(() => setFlag(true));
  afterEach(() => {
    delete (globalThis as unknown as FlagHost).__SEALD_FEATURE_OVERRIDES__;
  });

  it('renders nothing while fieldMetaV2 is off', () => {
    setFlag(false);
    renderWithTheme(<Harness />);
    expect(screen.queryByRole('group', { name: 'Date fields' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Date format' })).not.toBeInTheDocument();
  });

  it('starts by keeping what the signer enters', () => {
    renderWithTheme(<Harness />);
    expect(screen.getByRole('combobox', { name: 'Date format' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Timezone' })).toHaveValue('');
    expect(screen.getByText('Dates stay exactly as the signer enters them.')).toBeInTheDocument();
  });

  it('offers every supported format and reports the choice', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithTheme(<Harness onChange={onChange} />);
    const select = screen.getByRole('combobox', { name: 'Date format' });
    expect(screen.getAllByRole('option', { name: /2026|Mar/ })).toHaveLength(6);
    await user.selectOptions(select, 'dd/MM/yyyy');
    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_SEND_REMINDER_SETTINGS,
      dateFormat: 'dd/MM/yyyy',
    });
  });

  it('previews today in the chosen format and timezone', async () => {
    const user = userEvent.setup();
    renderWithTheme(<Harness />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Date format' }), 'yyyy-MM-dd');
    expect(screen.getByText(/Today would read 2026-10-22\./)).toBeInTheDocument();
    // 23:30 UTC is already the next day in Jerusalem (UTC+3 in October).
    await user.selectOptions(screen.getByRole('combobox', { name: 'Timezone' }), 'Asia/Jerusalem');
    expect(screen.getByText(/Today would read 2026-10-23\./)).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(<Harness />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
