import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expiryDateBounds } from 'shared';
import { ThemeProvider } from 'styled-components';
import { vi } from 'vitest';
import {
  DEFAULT_SEND_REMINDER_SETTINGS,
  type SendReminderSettings,
} from '@/features/envelopes/sendReminderSettings';
import { seald } from '@/styles/theme';
import { SendSettings } from './SendSettings';

type FlagHost = { __SEALD_FEATURE_OVERRIDES__?: Record<string, boolean> };

const NOW = Date.parse('2026-10-22T10:00:00.000Z');

function setFlag(on: boolean): void {
  (globalThis as unknown as FlagHost).__SEALD_FEATURE_OVERRIDES__ = { customReminders: on };
}

function Harness({ onChange }: { readonly onChange?: (next: SendReminderSettings) => void }) {
  const [value, setValue] = useState<SendReminderSettings>(DEFAULT_SEND_REMINDER_SETTINGS);
  return (
    <ThemeProvider theme={seald}>
      <SendSettings
        value={value}
        nowMs={NOW}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
    </ThemeProvider>
  );
}

describe('SendSettings', () => {
  beforeEach(() => setFlag(true));
  afterEach(() => {
    delete (globalThis as unknown as FlagHost).__SEALD_FEATURE_OVERRIDES__;
  });

  it('renders nothing while customReminders is off', () => {
    setFlag(false);
    render(<Harness />);
    expect(screen.queryByRole('group', { name: /expiry and reminders/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Expires in' })).not.toBeInTheDocument();
  });

  it('shows the defaults: 30 days, first after 1 day, every 1 day, at most 7', () => {
    render(<Harness />);
    expect(screen.getByRole('group', { name: /expiry and reminders/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Expires in' })).toHaveValue('30');
    expect(screen.getByRole('spinbutton', { name: 'First reminder after (days)' })).toHaveValue(1);
    expect(screen.getByRole('spinbutton', { name: 'Then every (days)' })).toHaveValue(1);
    expect(screen.getByRole('spinbutton', { name: 'Maximum reminders' })).toHaveValue(7);
  });

  it('offers the 7, 14, 30, 60 and 90 day presets plus a custom date', () => {
    render(<Harness />);
    const select = screen.getByRole('combobox', { name: 'Expires in' });
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['7 days', '14 days', '30 days', '60 days', '90 days', 'Custom date']);
    expect(select).toBeInTheDocument();
  });

  it('reports a preset expiry choice', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Expires in' }), '60');
    expect(onChange).toHaveBeenLastCalledWith({
      expiry: { kind: 'days', days: 60 },
      cadence: DEFAULT_SEND_REMINDER_SETTINGS.cadence,
    });
  });

  it('shows a date input bounded to tomorrow through day 90 when Custom date is chosen', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Expires in' }), 'custom');
    const bounds = expiryDateBounds(NOW);
    const date = screen.getByLabelText('Expiry date');
    expect(date).toHaveAttribute('min', bounds.min);
    expect(date).toHaveAttribute('max', bounds.max);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ expiry: { kind: 'date', date: bounds.min } }),
    );
  });

  it('ignores a custom date outside the bounds', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Expires in' }), {
      target: { value: 'custom' },
    });
    onChange.mockClear();
    fireEvent.change(screen.getByLabelText('Expiry date'), { target: { value: '2030-01-01' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('applies a valid cadence value and ignores one outside its bounds', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const first = screen.getByRole('spinbutton', { name: 'First reminder after (days)' });

    fireEvent.change(first, { target: { value: '3' } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ cadence: expect.objectContaining({ firstAfterDays: 3 }) }),
    );

    onChange.mockClear();
    fireEvent.change(first, { target: { value: '31' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('caps the maximum reminders at seven', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const max = screen.getByRole('spinbutton', { name: 'Maximum reminders' });
    expect(max).toHaveAttribute('max', '7');
    fireEvent.change(max, { target: { value: '8' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(max, { target: { value: '4' } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ cadence: expect.objectContaining({ maxReminders: 4 }) }),
    );
  });

  it('disables every control when disabled', () => {
    render(
      <ThemeProvider theme={seald}>
        <SendSettings
          value={DEFAULT_SEND_REMINDER_SETTINGS}
          onChange={() => undefined}
          disabled
          nowMs={NOW}
        />
      </ThemeProvider>,
    );
    expect(screen.getByRole('combobox', { name: 'Expires in' })).toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: 'Maximum reminders' })).toBeDisabled();
  });
});
