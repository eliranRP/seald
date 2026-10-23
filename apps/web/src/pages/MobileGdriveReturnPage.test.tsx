import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { seald } from '@/styles/theme';
import { MobileGdriveReturnPage } from './MobileGdriveReturnPage';

/**
 * PR-6 audit §9 (MEDIUM): the previous implementation rendered `null`
 * during the redirect, producing a brief white flash on iOS Safari
 * (150-300 ms). We now render a visible "Opening your Drive…" status
 * surface so the user has feedback instead of an empty page. The bounce now
 * lands on the Upload screen: the `/m/send` wizard it returned to is retired.
 */
function Here() {
  const loc = useLocation();
  return <div>{`landed ${loc.pathname}${loc.search}`}</div>;
}

describe('MobileGdriveReturnPage', () => {
  it('renders a visible loading status while the redirect is in flight', () => {
    render(
      <ThemeProvider theme={seald}>
        <MemoryRouter initialEntries={['/m/send/drive']}>
          <Routes>
            <Route path="/m/send/drive" element={<MobileGdriveReturnPage />} />
            <Route path="/document/new" element={<Here />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    );
    // The redirect happens in a useEffect; by the time the assertion runs
    // the navigation has fired and the Upload screen carries the arg that
    // re-opens the Drive picker.
    expect(screen.getByText('landed /document/new?gdrive_connected=1')).toBeInTheDocument();
  });

  it('exposes an accessible status message before the navigate fires', () => {
    render(
      <ThemeProvider theme={seald}>
        <MemoryRouter initialEntries={['/m/send/drive']}>
          {/* Render the page in isolation (no Routes) so the redirect
              can't synchronously replace it — this asserts what the
              user sees during the 150-300ms iOS Safari blank window. */}
          <MobileGdriveReturnPage />
        </MemoryRouter>
      </ThemeProvider>,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
