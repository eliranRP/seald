import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { GDriveOAuthCallbackPage } from './GDriveOAuthCallbackPage';

// Bug G (Phase 6.A iter-2 PROD, 2026-05-04). The OAuth-callback popup
// is opened at 480 × 720 px. Landing on `/settings/integrations?connected=1`
// triggered AppShell's mobile-redirect rule (≤ 640 px → /m/send) before
// the popup-bridge effect could fire, so the popup ended up at /m/send
// and never closed. Fix: dedicated `/oauth/gdrive/callback` route mounted
// OUTSIDE AppShell. This file pins the component contract; the routing
// pin lives in AppRoutes.gdrive-oauth-callback.test.tsx.

describe('GDriveOAuthCallbackPage (Bug G)', () => {
  let originalOpener: Window | null;
  let postMessageSpy: ReturnType<typeof vi.fn>;
  let closeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalOpener = window.opener;
    postMessageSpy = vi.fn();
    closeSpy = vi.fn();
    Object.defineProperty(window, 'close', {
      value: closeSpy,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'opener', {
      value: originalOpener,
      writable: true,
      configurable: true,
    });
  });

  it('popup mode: posts gdrive-oauth-complete to opener and closes the window', async () => {
    const fakeOpener = { postMessage: postMessageSpy } as unknown as Window;
    Object.defineProperty(window, 'opener', {
      value: fakeOpener,
      writable: true,
      configurable: true,
    });

    render(
      <MemoryRouter initialEntries={['/oauth/gdrive/callback?connected=1']}>
        <Routes>
          <Route path="/oauth/gdrive/callback" element={<GDriveOAuthCallbackPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'gdrive-oauth-complete' },
        window.location.origin,
      );
    });
    await waitFor(() => expect(closeSpy).toHaveBeenCalled());
  });

  it('popup mode: shows a small "Connecting Drive…" surface so the popup does not flash blank', async () => {
    const fakeOpener = { postMessage: postMessageSpy } as unknown as Window;
    Object.defineProperty(window, 'opener', {
      value: fakeOpener,
      writable: true,
      configurable: true,
    });

    render(
      <MemoryRouter initialEntries={['/oauth/gdrive/callback?connected=1']}>
        <Routes>
          <Route path="/oauth/gdrive/callback" element={<GDriveOAuthCallbackPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/connecting drive/i)).toBeInTheDocument();
  });

  it('same-tab fallback (no opener): redirects to /settings/integrations?connected=1', async () => {
    Object.defineProperty(window, 'opener', {
      value: null,
      writable: true,
      configurable: true,
    });

    render(
      <MemoryRouter initialEntries={['/oauth/gdrive/callback?connected=1']}>
        <Routes>
          <Route path="/oauth/gdrive/callback" element={<GDriveOAuthCallbackPage />} />
          <Route path="/settings/integrations" element={<h1>integrations stub</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: /integrations stub/i })).toBeInTheDocument();
    expect(closeSpy).not.toHaveBeenCalled();
  });
});
