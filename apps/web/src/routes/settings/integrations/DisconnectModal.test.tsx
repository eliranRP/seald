import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithTheme } from '../../../test/renderWithTheme';
import { DisconnectModal } from './DisconnectModal';

describe('DisconnectModal', () => {
  it('renders nothing when closed', () => {
    renderWithTheme(
      <DisconnectModal open={false} accountEmail="x@y.com" onClose={vi.fn()} onConfirm={vi.fn()} />,
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('shows the account email + destructive Disconnect CTA', () => {
    renderWithTheme(
      <DisconnectModal
        open
        accountEmail="eliran@example.com"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('alertdialog', { name: /disconnect google drive/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('eliran@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^disconnect$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('Cancel fires onClose; Disconnect fires onConfirm', async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    renderWithTheme(
      <DisconnectModal open accountEmail="x@y.com" onClose={onClose} onConfirm={onConfirm} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: /^disconnect$/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('Escape key fires onClose', () => {
    const onClose = vi.fn();
    renderWithTheme(
      <DisconnectModal open accountEmail="x@y.com" onClose={onClose} onConfirm={vi.fn()} />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons while pending=true', () => {
    renderWithTheme(
      <DisconnectModal open pending accountEmail="x@y.com" onClose={vi.fn()} onConfirm={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /^disconnect$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
  });
});
