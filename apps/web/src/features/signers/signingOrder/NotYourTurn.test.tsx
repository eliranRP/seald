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
    expect(screen.getByRole('heading', { name: /not your turn yet/i })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Sent');
    expect(screen.getByText(/email you when it's your turn/i)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('names the signer who is up', () => {
    render(
      <ThemeProvider theme={seald}>
        <NotYourTurn waitingOn="Alex" senderName="Eliran Azulay" />
      </ThemeProvider>,
    );
    expect(screen.getByText('Alex signs first')).toBeInTheDocument();
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

  it('matches the API body { error: not_your_turn }, which the signer client exposes as code', () => {
    const err = Object.assign(new Error('Conflict'), { status: 409, code: 'not_your_turn' });
    expect(isNotYourTurnError(err)).toBe(true);
  });
});
