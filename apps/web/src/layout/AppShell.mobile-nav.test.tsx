import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../test/renderWithProviders';
import { AppShell } from './AppShell';

// Production bug (2026-05-03): every authed surface inside AppShell
// (`/documents`, `/templates`, `/signers`, `/document/<id>`, `/document/new`)
// rendered the desktop NavBar at 390 px because AppShell wired NavBar
// unconditionally — no useIsMobileViewport branch. The slim 52 px
// MWMobileNav only existed inside MobileSendPage. The result was a
// `Documents | Sign | Templates` tab row with "Templates" clipped at the
// right edge on every authed mobile route.
//
// Lock the rule in: when useIsMobileViewport is true, AppShell must
// render the slim mobile chrome (logo + hamburger only) — not the
// desktop tab row.

vi.mock('@/features/account', () => ({
  useAccountActions: () => ({
    exportData: vi.fn(),
    deleteAccount: vi.fn(),
    isExporting: false,
    isDeleting: false,
  }),
}));

let mobileViewport = false;

vi.mock('../hooks/useIsMobileViewport', () => ({
  useIsMobileViewport: () => mobileViewport,
  readIsMobileViewport: () => mobileViewport,
  MOBILE_VIEWPORT_QUERY: '(max-width: 640px)',
}));

afterEach(() => {
  mobileViewport = false;
});

function renderShell() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/documents']}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/documents" element={<div>doc list</div>} />
          <Route path="/signin" element={<div>sign in</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppShell — mobile-aware top chrome', () => {
  it('renders the desktop NavBar with the full tab row on a desktop viewport', () => {
    mobileViewport = false;
    const { getByRole } = renderShell();
    // The desktop NavBar exposes the primary tabs as nav items.
    expect(getByRole('button', { name: /^documents$/i })).toBeInTheDocument();
    expect(getByRole('button', { name: /^templates$/i })).toBeInTheDocument();
  });

  it('renders the slim mobile bar (Seald home + hamburger) on a mobile viewport — no desktop tab row', () => {
    mobileViewport = true;
    const { getByRole, queryByRole } = renderShell();
    // Slim mobile chrome must show the hamburger trigger…
    expect(getByRole('button', { name: /open menu/i })).toBeInTheDocument();
    // …and the brand button (logo + word "Seald").
    expect(getByRole('button', { name: /seald home/i })).toBeInTheDocument();
    // The desktop tab row must NOT be in the DOM at this viewport.
    expect(queryByRole('button', { name: /^templates$/i })).toBeNull();
    expect(queryByRole('button', { name: /^sign$/i })).toBeNull();
  });
});
