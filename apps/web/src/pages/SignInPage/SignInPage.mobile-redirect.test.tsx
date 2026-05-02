import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import { SignInPage } from './SignInPage';

// Audit gap (2026-05-03): mobile users tapping "Skip — try it" landed on
// `/document/new` (the desktop guest workspace), not `/m/send` (the mobile
// sender flow). The page hardcoded the destination instead of branching
// on `useIsMobileViewport`. Lock the rule in so a future regression that
// drops the viewport check is caught here, not by a user.

let mobileViewport = false;

vi.mock('@/hooks/useIsMobileViewport', () => ({
  useIsMobileViewport: () => mobileViewport,
  readIsMobileViewport: () => mobileViewport,
  MOBILE_VIEWPORT_QUERY: '(max-width: 640px)',
}));

afterEach(() => {
  mobileViewport = false;
});

function renderAt() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/signin']}>
      <Routes>
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/document/new" element={<h1>Guest document workspace</h1>} />
        <Route path="/m/send" element={<h1>Mobile sender flow</h1>} />
      </Routes>
    </MemoryRouter>,
    { auth: { user: null, enterGuestMode: vi.fn(async () => undefined) } },
  );
}

describe('SignInPage — mobile-aware Skip routing', () => {
  it('routes the guest skip path to /document/new on desktop', async () => {
    const user = userEvent.setup();
    mobileViewport = false;
    renderAt();
    await user.click(screen.getByRole('button', { name: /skip — try it/i }));
    expect(
      await screen.findByRole('heading', { name: /guest document workspace/i }),
    ).toBeInTheDocument();
  });

  it('routes the guest skip path to /m/send on mobile so the desktop dashboard never flashes', async () => {
    const user = userEvent.setup();
    mobileViewport = true;
    renderAt();
    await user.click(screen.getByRole('button', { name: /skip — try it/i }));
    expect(await screen.findByRole('heading', { name: /mobile sender flow/i })).toBeInTheDocument();
  });
});
