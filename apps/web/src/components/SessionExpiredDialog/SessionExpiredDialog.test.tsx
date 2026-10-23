import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { SessionExpiredDialog } from './SessionExpiredDialog';

describe('SessionExpiredDialog', () => {
  it('renders nothing while closed', () => {
    renderWithTheme(<SessionExpiredDialog open={false} onSignIn={vi.fn()} />);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('names the state and offers Sign in again', async () => {
    const onSignIn = vi.fn();
    renderWithTheme(<SessionExpiredDialog open onSignIn={onSignIn} />);
    expect(screen.getByRole('alertdialog', { name: 'You were signed out' })).toBeInTheDocument();
    expect(screen.getByText('Sign in to keep going.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in again' }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it('cannot be dismissed with Escape', async () => {
    renderWithTheme(<SessionExpiredDialog open onSignIn={vi.fn()} />);
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('is a bottom sheet on phones and survives Escape and backdrop taps', async () => {
    renderWithTheme(<SessionExpiredDialog open mobile onSignIn={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'You were signed out' });
    await userEvent.keyboard('{Escape}');
    await userEvent.click(dialog);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in again' })).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { baseElement } = renderWithTheme(<SessionExpiredDialog open onSignIn={vi.fn()} />);
    expect(await axe(baseElement)).toHaveNoViolations();
  });
});
