import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
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

  it('traps Tab focus inside the alertdialog (Tab from last wraps to first)', () => {
    // Phase 6.A iter-2 LOCAL bug. Pre-fix the `alertdialog` had no
    // Tab trap — keyboard-only users could Tab out of the destructive
    // confirm into the underlying IntegrationsPage (Connect button,
    // header links) without dismissing. WCAG 2.1.2 (No Keyboard Trap)
    // applies BOTH ways: a modal must trap focus AND release on close.
    // Post-fix Tab from the last focusable wraps to the first.
    renderWithTheme(
      <>
        <button type="button">outside-before</button>
        <DisconnectModal open accountEmail="x@y.com" onClose={vi.fn()} onConfirm={vi.fn()} />
        <button type="button">outside-after</button>
      </>,
    );
    const dialog = screen.getByRole('alertdialog');
    const insideButtons = within(dialog).getAllByRole('button');
    const last = insideButtons[insideButtons.length - 1]!;
    last.focus();
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(dialog, { key: 'Tab' });
    // Trap fires preventDefault + focuses first focusable. Robust
    // assertion: focus stayed inside the dialog (did not escape to
    // the outside-after button).
    expect(document.activeElement).not.toBe(last);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('renders an inline error message when the `error` prop is set', () => {
    // Phase 6.A iter-2 LOCAL bug. Pre-fix DisconnectModal accepted no
    // error state — if the disconnect mutation failed (network drop,
    // 5xx, race), the modal silently sat in a non-pending state with
    // no feedback. Post-fix the modal renders the error message and
    // re-enables Cancel + Disconnect so the user can retry or back
    // out. The wrapper is `role="alert"` so screen readers announce.
    renderWithTheme(
      <DisconnectModal
        open
        accountEmail="x@y.com"
        error="We couldn't disconnect that account. Try again."
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/couldn.?t disconnect/i);
    // Buttons are re-enabled so the user can retry or cancel.
    expect(screen.getByRole('button', { name: /^disconnect$/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel/i })).not.toBeDisabled();
  });
});
