import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { GDriveOAuthCallbackPage } from './GDriveOAuthCallbackPage';
import { GDRIVE_OAUTH_BROADCAST_CHANNEL } from '@/routes/settings/integrations/useGDriveAccounts';

/**
 * Bug G + Bug I (Phase 6.A iter-2 PROD, 2026-05-04). The OAuth-callback
 * popup is opened at 480 × 720 px. Two compounding failures:
 *
 *   - Bug G: landing on /settings/integrations triggered AppShell's
 *     mobile-redirect (≤ 640 px → /m/send) before the bridge effect
 *     could close the popup. Fixed by mounting /oauth/gdrive/callback
 *     OUTSIDE AppShell (PR #134).
 *
 *   - Bug I: the api response carries `Cross-Origin-Opener-Policy:
 *     same-origin` (helmet default). For a cross-origin popup, that
 *     header puts the popup in a fresh browsing-context group and
 *     severs `window.opener` PERMANENTLY — even after the popup later
 *     redirects back to the same-origin bridge route. The bridge then
 *     saw opener=null, fell through to its same-tab Navigate, and
 *     AppShell's mobile-redirect fired again → /m/send.
 *
 * Two-pronged fix here:
 *   1. Bridge ALWAYS posts on a same-origin `BroadcastChannel` so the
 *      parent tab is notified even when COOP severs `window.opener`.
 *   2. Bridge NEVER navigates to /settings/integrations from inside
 *      the popup — it just renders a static "Drive connected" surface
 *      so the popup-on-mobile-viewport never trips AppShell's guard.
 */
describe('GDriveOAuthCallbackPage (Bug G + Bug I)', () => {
  let originalOpener: Window | null;
  let postMessageSpy: ReturnType<typeof vi.fn>;
  let closeSpy: ReturnType<typeof vi.fn>;
  let bcInstances: Array<{
    name: string;
    postMessage: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }>;
  let originalBroadcastChannel: typeof globalThis.BroadcastChannel | undefined;

  beforeEach(() => {
    originalOpener = window.opener;
    postMessageSpy = vi.fn();
    closeSpy = vi.fn();
    bcInstances = [];
    Object.defineProperty(window, 'close', {
      value: closeSpy,
      writable: true,
      configurable: true,
    });
    // Stub BroadcastChannel — jsdom doesn't ship it.
    originalBroadcastChannel = globalThis.BroadcastChannel;
    class StubBC {
      postMessage: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
      onmessage: ((ev: MessageEvent) => void) | null = null;
      constructor(public readonly name: string) {
        this.postMessage = vi.fn();
        this.close = vi.fn();
        bcInstances.push({ name, postMessage: this.postMessage, close: this.close });
      }
      addEventListener() {}
      removeEventListener() {}
    }
    Object.defineProperty(globalThis, 'BroadcastChannel', {
      value: StubBC as unknown as typeof globalThis.BroadcastChannel,
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
    if (originalBroadcastChannel) {
      Object.defineProperty(globalThis, 'BroadcastChannel', {
        value: originalBroadcastChannel,
        writable: true,
        configurable: true,
      });
    }
  });

  it('always posts on the same-origin BroadcastChannel even when window.opener is null (Bug I — COOP severed)', async () => {
    Object.defineProperty(window, 'opener', {
      value: null,
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
      const ch = bcInstances.find((b) => b.name === GDRIVE_OAUTH_BROADCAST_CHANNEL);
      expect(ch).toBeDefined();
      expect(ch?.postMessage).toHaveBeenCalledWith({ type: 'gdrive-oauth-complete' });
    });
  });

  it('popup mode: posts gdrive-oauth-complete to opener AND BroadcastChannel, then closes', async () => {
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
    await waitFor(() => {
      const ch = bcInstances.find((b) => b.name === GDRIVE_OAUTH_BROADCAST_CHANNEL);
      expect(ch?.postMessage).toHaveBeenCalledWith({ type: 'gdrive-oauth-complete' });
    });
    await waitFor(() => expect(closeSpy).toHaveBeenCalled());
  });

  it('renders a static "Drive connected" surface — never <Navigate> to /settings/integrations (would trip mobile guard)', async () => {
    Object.defineProperty(window, 'opener', {
      value: null,
      writable: true,
      configurable: true,
    });

    render(
      <MemoryRouter initialEntries={['/oauth/gdrive/callback?connected=1']}>
        <Routes>
          <Route path="/oauth/gdrive/callback" element={<GDriveOAuthCallbackPage />} />
          <Route path="/settings/integrations" element={<h1>SHOULD NOT REACH integrations</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/drive connected|connecting drive/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /SHOULD NOT REACH/i })).not.toBeInTheDocument();
  });

  // Audit C: GDriveOAuthCallback #7 — replace raw inline hex / font with
  // theme-driven styled-components inside a local ThemeProvider.
  it('does not bake raw hex colors into inline style attributes', () => {
    Object.defineProperty(window, 'opener', { value: null, writable: true, configurable: true });
    const { container } = render(
      <MemoryRouter initialEntries={['/oauth/gdrive/callback?connected=1']}>
        <Routes>
          <Route path="/oauth/gdrive/callback" element={<GDriveOAuthCallbackPage />} />
        </Routes>
      </MemoryRouter>,
    );
    const styled = container.querySelectorAll('[style]');
    for (const el of Array.from(styled)) {
      const style = el.getAttribute('style') ?? '';
      // No literal hex color hard-coded in `style` (styled-components
      // emit classes, not inline color attributes).
      expect(/#[0-9a-fA-F]{3,8}/.test(style)).toBe(false);
    }
  });

  // Audit C: GDriveOAuthCallback #16 — popup-blocker recovery Close button.
  it('renders a Close button that invokes window.close() on click', async () => {
    Object.defineProperty(window, 'opener', { value: null, writable: true, configurable: true });
    render(
      <MemoryRouter initialEntries={['/oauth/gdrive/callback?connected=1']}>
        <Routes>
          <Route path="/oauth/gdrive/callback" element={<GDriveOAuthCallbackPage />} />
        </Routes>
      </MemoryRouter>,
    );
    closeSpy.mockClear();
    const close = await screen.findByRole('button', { name: /^close$/i });
    close.click();
    expect(closeSpy).toHaveBeenCalled();
  });
});
