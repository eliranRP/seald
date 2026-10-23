import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import { takeRememberedNext } from '../../layout/nextPath';
import { SignUpPage } from './SignUpPage';

// "Sign in to approve" can end on /signup. A valid `?next=` (an approval
// path) must survive account creation, the switch to sign-in, and the
// Google / confirmation-email round trip that returns through /auth/callback.

const NEXT = '/approve/abc123/review?page=1';
const ENCODED = encodeURIComponent(NEXT);

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{`${loc.pathname}${loc.search}`}</p>;
}

function renderSignUp(entry: string, auth: Parameters<typeof renderWithProviders>[1] = {}) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/signin" element={<Where />} />
        <Route path="/documents" element={<h1>Documents dashboard</h1>} />
        <Route path="/approve/:id/review" element={<h1>Approval review</h1>} />
      </Routes>
    </MemoryRouter>,
    auth,
  );
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/full name/i), 'Ada Lovelace');
  await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
  await user.type(screen.getByLabelText(/^password$/i), 'hunter2hunter');
  await user.click(screen.getByLabelText(/18 or older/i));
  await user.click(screen.getByRole('button', { name: /create account/i }));
}

describe('SignUpPage — ?next= return path', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('returns to the approval review after sign-up with an immediate session', async () => {
    const user = userEvent.setup();
    renderSignUp(`/signup?next=${ENCODED}`, {
      auth: { signUpWithPassword: vi.fn(async () => ({ needsEmailConfirmation: false })) },
    });
    await fillAndSubmit(user);
    expect(await screen.findByRole('heading', { name: /approval review/i })).toBeInTheDocument();
  });

  it('ignores an unsafe ?next= and lands on the dashboard', async () => {
    const user = userEvent.setup();
    renderSignUp('/signup?next=%2F%2Fevil.com', {
      auth: { signUpWithPassword: vi.fn(async () => ({ needsEmailConfirmation: false })) },
    });
    await fillAndSubmit(user);
    expect(
      await screen.findByRole('heading', { name: /documents dashboard/i }),
    ).toBeInTheDocument();
  });

  it('parks the path for the Google and confirmation-email round trip, once', () => {
    renderSignUp(`/signup?next=${ENCODED}`);
    expect(takeRememberedNext()).toBe(NEXT);
    expect(takeRememberedNext()).toBeNull();
  });

  it('parks nothing without a valid ?next=', () => {
    renderSignUp('/signup?next=%2F%2Fevil.com');
    expect(takeRememberedNext()).toBeNull();
  });

  it('keeps ?next= when the owner switches to sign-in', async () => {
    const user = userEvent.setup();
    renderSignUp(`/signup?next=${ENCODED}`);
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(await screen.findByTestId('where')).toHaveTextContent(`/signin?next=${ENCODED}`);
  });
});
