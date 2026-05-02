import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { GuestSenderEmailDialog } from './GuestSenderEmailDialog';

describe('GuestSenderEmailDialog', () => {
  it('does not render when closed', () => {
    renderWithProviders(
      <GuestSenderEmailDialog open={false} onConfirm={vi.fn()} onCancel={vi.fn()} />,
      {},
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders an email input and Continue button when open', () => {
    renderWithProviders(<GuestSenderEmailDialog open onConfirm={vi.fn()} onCancel={vi.fn()} />, {});
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/your email/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });

  it('refuses to confirm with an empty email and surfaces an error', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderWithProviders(
      <GuestSenderEmailDialog open onConfirm={onConfirm} onCancel={vi.fn()} />,
      {},
    );
    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/email/i);
  });

  it('refuses to confirm with a malformed email', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderWithProviders(
      <GuestSenderEmailDialog open onConfirm={onConfirm} onCancel={vi.fn()} />,
      {},
    );
    await user.type(screen.getByLabelText(/your email/i), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/valid email/i);
  });

  it('fires onConfirm with trimmed email and undefined name when name is omitted', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderWithProviders(
      <GuestSenderEmailDialog open onConfirm={onConfirm} onCancel={vi.fn()} />,
      {},
    );
    await user.type(screen.getByLabelText(/your email/i), '  ada@example.com  ');
    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(onConfirm).toHaveBeenCalledWith('ada@example.com', undefined);
  });

  it('fires onConfirm with trimmed name when provided', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderWithProviders(
      <GuestSenderEmailDialog open onConfirm={onConfirm} onCancel={vi.fn()} />,
      {},
    );
    await user.type(screen.getByLabelText(/your email/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/your name/i), '  Ada Lovelace  ');
    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(onConfirm).toHaveBeenCalledWith('ada@example.com', 'Ada Lovelace');
  });

  it('fires onCancel when the Cancel button is clicked', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderWithProviders(
      <GuestSenderEmailDialog open onConfirm={vi.fn()} onCancel={onCancel} />,
      {},
    );
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
