import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/renderWithProviders';
import { NotFoundPage } from './NotFoundPage';
import { NotFoundRoute } from './NotFoundRoute';

vi.mock('@/features/account', () => ({
  useAccountActions: () => ({
    exportData: vi.fn(),
    deleteAccount: vi.fn(),
    isExporting: false,
    isDeleting: false,
  }),
}));

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{`${loc.pathname}${loc.search}`}</div>;
}

function renderPage(variant: 'app' | 'public') {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/nope']}>
      <Routes>
        <Route path="/nope" element={<NotFoundPage variant={variant} />} />
        <Route path="/documents" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('NotFoundPage', () => {
  it('says the page was not found', () => {
    renderPage('app');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('sends the search to /documents?q=', async () => {
    renderPage('app');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Find a document' }), 'nda{Enter}');
    expect(screen.getByTestId('where')).toHaveTextContent('/documents?q=nda');
  });

  it('goes to the documents list without a query', async () => {
    renderPage('app');
    await userEvent.click(screen.getByRole('button', { name: 'Go to documents' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/documents');
  });

  it('offers the marketing site, not a search, when signed out', () => {
    renderPage('public');
    expect(screen.getByRole('button', { name: 'Go to seald.co' })).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });
});

describe('NotFoundRoute', () => {
  function renderRoute(auth: Parameters<typeof renderWithProviders>[1]) {
    return renderWithProviders(
      <MemoryRouter initialEntries={['/some/unknown/path']}>
        <Routes>
          <Route path="*" element={<NotFoundRoute />} />
        </Routes>
      </MemoryRouter>,
      auth,
    );
  }

  it('renders inside the app shell for a signed-in user', () => {
    renderRoute({});
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Documents$/i })).toBeInTheDocument();
  });

  it('renders a public 404 without the shell when signed out', () => {
    renderRoute({ auth: { user: null } });
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to seald.co' })).toBeInTheDocument();
  });

  it('shows a loading screen while auth resolves', () => {
    renderRoute({ auth: { user: null, loading: true } });
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });
});
