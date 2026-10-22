import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import { SignInPage } from './SignInPage';

// Sign-in with a `?next=` return path. Only a validated `/approve/…` path is
// honoured; everything else falls back to the usual desktop / mobile landing.
// The approval review is exempt from the ≤640px redirect, so a phone owner
// lands on the review and not on /m/send.

let mobileViewport = false;

vi.mock('@/hooks/useIsMobileViewport', () => ({
  useIsMobileViewport: () => mobileViewport,
  readIsMobileViewport: () => mobileViewport,
  MOBILE_VIEWPORT_QUERY: '(max-width: 640px)',
}));

afterEach(() => {
  mobileViewport = false;
});

function renderAt(initialEntry: string) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/documents" element={<h1>Documents dashboard</h1>} />
        <Route path="/m/send" element={<h1>Mobile sender flow</h1>} />
        <Route path="/approve/:id/review" element={<h1>Approval review</h1>} />
      </Routes>
    </MemoryRouter>,
    { auth: { signInWithPassword: vi.fn(async () => undefined) } },
  );
}

async function submitSignIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
  await user.type(screen.getByLabelText(/^password$/i), 'hunter2hunter');
  await user.click(screen.getByRole('button', { name: /^sign in$/i }));
}

describe('SignInPage — ?next= return path', () => {
  it('returns a desktop owner to the approval review after sign-in', async () => {
    const user = userEvent.setup();
    mobileViewport = false;
    renderAt('/signin?next=%2Fapprove%2Fabc%2Freview%3Fpage%3D1');
    await submitSignIn(user);
    expect(await screen.findByRole('heading', { name: /approval review/i })).toBeInTheDocument();
  });

  it('returns a mobile owner to the approval review, not /m/send', async () => {
    const user = userEvent.setup();
    mobileViewport = true;
    renderAt('/signin?next=%2Fapprove%2Fabc%2Freview');
    await submitSignIn(user);
    expect(await screen.findByRole('heading', { name: /approval review/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /mobile sender flow/i })).toBeNull();
  });

  it.each([
    ['protocol-relative', '%2F%2Fevil.com'],
    ['absolute URL', 'https%3A%2F%2Fevil.com%2Fapprove%2Fabc'],
    ['backslash', '%2F%5Cevil.com'],
    ['double-encoded', '%252F%252Fevil.com'],
  ])('ignores an unsafe ?next= (%s) and uses the mobile default', async (_label, encoded) => {
    const user = userEvent.setup();
    mobileViewport = true;
    renderAt(`/signin?next=${encoded}`);
    await submitSignIn(user);
    expect(await screen.findByRole('heading', { name: /mobile sender flow/i })).toBeInTheDocument();
  });

  it('ignores an unsafe ?next= and uses the desktop default', async () => {
    const user = userEvent.setup();
    mobileViewport = false;
    renderAt('/signin?next=%2F%2Fevil.com');
    await submitSignIn(user);
    expect(
      await screen.findByRole('heading', { name: /documents dashboard/i }),
    ).toBeInTheDocument();
  });
});
