import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { JSX } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../test/renderWithProviders';
import { AppShell } from './AppShell';

vi.mock('@/features/account', () => ({
  useAccountActions: () => ({
    exportData: vi.fn(),
    deleteAccount: vi.fn(),
    isExporting: false,
    isDeleting: false,
  }),
}));

vi.mock('../lib/observability', () => ({
  reportError: vi.fn(),
  initSentry: vi.fn(),
}));

function Boom(): JSX.Element {
  throw new Error('Kaboom');
}

function renderShellAt(path: string) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/documents" element={<div>doc list</div>} />
          <Route path="/document/:id/sent" element={<Boom />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

// React intentionally logs caught errors to console.error in dev. Silence
// the noise so the suite output stays clean — same pattern the
// ErrorBoundary unit tests use.
let consoleSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  consoleSpy.mockRestore();
});

describe('AppShell error boundary (route-crash containment)', () => {
  it('renders the routed content normally when nothing throws', () => {
    const { getByText, queryByRole } = renderShellAt('/documents');
    expect(getByText('doc list')).toBeInTheDocument();
    expect(queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the NavBar + legal footer mounted when the routed page throws', () => {
    const { getByRole } = renderShellAt('/document/abc-123/sent');

    // Boundary surfaces the recoverable fallback inside <Content>.
    expect(getByRole('alert')).toBeInTheDocument();
    expect(getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument();
    expect(getByRole('button', { name: /try again/i })).toBeInTheDocument();

    // NavBar still rendered above the boundary — the user can still click
    // away to a working route. This is the regression: pre-fix, an
    // uncaught render error in any route blanked the entire tree.
    expect(getByRole('navigation')).toBeInTheDocument();
    expect(getByRole('button', { name: /^Documents$/i })).toBeInTheDocument();

    // Legal footer (issue #39) is below the boundary in the same Shell —
    // it must also survive a route crash so consent withdrawal stays as
    // easy as giving consent (EDPB 03/2022 + CCPA §7026(a)(4)).
    expect(getByRole('contentinfo', { name: /legal and cookie preferences/i })).toBeInTheDocument();
  });
});
