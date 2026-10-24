import { describe, expect, it, vi } from 'vitest';
import { fireEvent, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '@/test/renderWithTheme';
import { SendOptionsDialog } from './SendOptionsDialog';
import type { SendOptionsDialogProps } from './SendOptionsDialog.types';

function setup(over: Partial<SendOptionsDialogProps> = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    onSend: vi.fn(),
    recipients: [
      { id: '1', name: 'Eliran Azulay', color: '#A78BFA' },
      { id: '2', name: 'Maya Raskin', color: '#F472B6' },
    ],
    remindersEnabled: true,
    onRemindersEnabledChange: vi.fn(),
    cadence: { firstAfterDays: 3, intervalDays: 3, maxReminders: 7 },
    onCadenceChange: vi.fn(),
    expiry: { kind: 'days', days: 30 } as const,
    onExpiryChange: vi.fn(),
    ...over,
  } satisfies SendOptionsDialogProps;
  return { props, ...renderWithTheme(<SendOptionsDialog {...props} />) };
}

describe('SendOptionsDialog', () => {
  it('renders nothing while closed', () => {
    const { queryByRole } = setup({ open: false });
    expect(queryByRole('dialog')).toBeNull();
  });

  it('shows the defaults: every 3 days, 30 days, signer count and seal', () => {
    const { getByRole, getByText } = setup();
    const dialog = getByRole('dialog', { name: 'Send options' });
    expect(within(dialog).getByRole('radio', { name: 'Every 3 days' })).toBeChecked();
    expect(within(dialog).getByRole('combobox', { name: 'Expires' })).toHaveValue('30');
    expect(getByText('2 signers · in any order')).toBeInTheDocument();
    expect(getByText('PAdES B-LT')).toBeInTheDocument();
  });

  it('says "in order" when signing in order', () => {
    const { getByText } = setup({ ordered: true });
    expect(getByText('2 signers · in order')).toBeInTheDocument();
  });

  it('turns reminders off and switches to weekly', () => {
    const { getByRole, props } = setup();
    fireEvent.click(getByRole('radio', { name: 'Off' }));
    expect(props.onRemindersEnabledChange).toHaveBeenCalledWith(false);
    fireEvent.click(getByRole('radio', { name: 'Weekly' }));
    expect(props.onRemindersEnabledChange).toHaveBeenCalledWith(true);
    expect(props.onCadenceChange).toHaveBeenCalledWith({
      firstAfterDays: 7,
      intervalDays: 7,
      maxReminders: 7,
    });
  });

  it('changes the expiry', () => {
    const { getByRole, props } = setup();
    fireEvent.change(getByRole('combobox', { name: 'Expires' }), { target: { value: '14' } });
    expect(props.onExpiryChange).toHaveBeenCalledWith({ kind: 'days', days: 14 });
  });

  it('sends with the footer button and closes on Cancel', () => {
    const { getByRole, props } = setup({ sendLabel: 'Sign now' });
    fireEvent.click(getByRole('button', { name: 'Sign now' }));
    expect(props.onSend).toHaveBeenCalledTimes(1);
    fireEvent.click(getByRole('button', { name: 'Cancel' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('shows extra controls under More options', () => {
    const { getByText } = setup({ advanced: <span>Date format</span> });
    expect(getByText('More options')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = setup();
    expect(await axe(container)).toHaveNoViolations();
  });
});
