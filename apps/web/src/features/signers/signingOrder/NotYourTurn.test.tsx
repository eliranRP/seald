import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'styled-components';
import { describe, expect, it, vi } from 'vitest';
import { seald } from '@/styles/theme';
import { isNotYourTurnError } from './isNotYourTurnError';
import { NotYourTurn } from './NotYourTurn';

describe('NotYourTurn', () => {
  it('explains the wait without sounding like an error', () => {
    render(
      <ThemeProvider theme={seald}>
        <NotYourTurn />
      </ThemeProvider>,
    );
    expect(screen.getByRole('heading', { name: /not your turn to sign yet/i })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/email you a signing link/i);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers Check again when a retry is given', async () => {
    const onRetry = vi.fn();
    render(
      <ThemeProvider theme={seald}>
        <NotYourTurn onRetry={onRetry} />
      </ThemeProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('isNotYourTurnError', () => {
  it('matches only a 409 not_your_turn', () => {
    expect(isNotYourTurnError(Object.assign(new Error('not_your_turn'), { status: 409 }))).toBe(
      true,
    );
    expect(isNotYourTurnError(Object.assign(new Error('already_signed'), { status: 409 }))).toBe(
      false,
    );
    expect(isNotYourTurnError(Object.assign(new Error('not_your_turn'), { status: 401 }))).toBe(
      false,
    );
    expect(isNotYourTurnError(null)).toBe(false);
  });
});
