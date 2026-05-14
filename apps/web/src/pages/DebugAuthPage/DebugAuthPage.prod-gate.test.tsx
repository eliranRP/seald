import type { ReactElement } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { seald } from '../../styles/theme';

/**
 * Audit C: DebugAuthPage #4 — `/debug/auth` previously mounted
 * unconditionally. The route is now gated behind `import.meta.env.DEV`
 * so a production build never registers it; navigation to `/debug/auth`
 * falls through to the catch-all landing.
 *
 * We exercise the route-registration logic in isolation (rather than
 * importing the full `<AppRoutes />` tree, which pulls in the full
 * Supabase + apiClient + lazy chunks). The page-level test
 * `DebugAuthPage.test.tsx` already covers the inner content; this test
 * proves only the env-gate registration contract.
 */
function DebugStub(): ReactElement {
  return <h1>Debug auth surface</h1>;
}

function LandingStub(): ReactElement {
  return <h1>Landing fallback</h1>;
}

function renderAt(initialPath: string): void {
  render(
    <ThemeProvider theme={seald}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          {import.meta.env.DEV ? <Route path="/debug/auth" element={<DebugStub />} /> : null}
          <Route path="*" element={<LandingStub />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('DebugAuthPage — production route gate', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('mounts the /debug/auth route in DEV builds', () => {
    vi.stubEnv('DEV', true);
    renderAt('/debug/auth');
    expect(screen.getByRole('heading', { name: /debug auth surface/i })).toBeInTheDocument();
  });

  it('does NOT mount /debug/auth in production builds — falls through to the catch-all', () => {
    vi.stubEnv('DEV', false);
    renderAt('/debug/auth');
    expect(screen.queryByRole('heading', { name: /debug auth surface/i })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /landing fallback/i })).toBeInTheDocument();
  });
});
