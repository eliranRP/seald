import { describe, it, expect } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { TemplatesListPage } from './TemplatesListPage';
import { TEMPLATES } from '../../features/templates';
import { renderWithProviders } from '../../test/renderWithProviders';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="probe">{`${location.pathname}${location.search}`}</div>;
}

function renderPage() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/templates']}>
      <Routes>
        <Route path="/templates" element={<TemplatesListPage />} />
        <Route path="/templates/:id/use" element={<LocationProbe />} />
        <Route path="/document/new" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TemplatesListPage', () => {
  it('renders the page heading and one card per template', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: /reuse what you've built/i }),
    ).toBeInTheDocument();
    for (const t of TEMPLATES) {
      expect(screen.getByRole('heading', { level: 3, name: t.name })).toBeInTheDocument();
    }
  });

  it('exposes a primary "New template" CTA and a dashed create card', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /^new template$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create a new template/i })).toBeInTheDocument();
  });

  it('clicking Use on a card navigates to the use-template route', async () => {
    renderPage();
    const first = TEMPLATES[0]!;
    await userEvent.click(screen.getByRole('button', { name: `Use ${first.name}` }));
    expect(screen.getByTestId('probe').textContent).toBe(
      `/templates/${encodeURIComponent(first.id)}/use`,
    );
  });

  it('switching to the Shared tab hides every template card', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('tab', { name: /shared with me/i }));
    for (const t of TEMPLATES) {
      expect(screen.queryByRole('heading', { level: 3, name: t.name })).toBeNull();
    }
  });

  it('clicking the New template button navigates to /document/new with source=template', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /^new template$/i }));
    expect(screen.getByTestId('probe').textContent).toBe('/document/new?source=template');
  });

  it('search filters templates case-insensitively against the name', async () => {
    renderPage();
    await userEvent.type(screen.getByRole('searchbox', { name: /search templates/i }), 'mutual');
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { level: 3, name: /independent contractor/i }),
      ).toBeNull();
    });
    expect(screen.getByRole('heading', { level: 3, name: /mutual nda/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: /photography release/i })).toBeNull();
  });

  it('search matches against description text too', async () => {
    renderPage();
    // "1099" only appears in the contractor template's description.
    await userEvent.type(screen.getByRole('searchbox', { name: /search templates/i }), '1099');
    await waitFor(() => {
      expect(screen.queryByRole('heading', { level: 3, name: /mutual nda/i })).toBeNull();
    });
    expect(
      screen.getByRole('heading', { level: 3, name: /independent contractor/i }),
    ).toBeInTheDocument();
  });

  it('chips compose with search to narrow results further', async () => {
    renderPage();
    await userEvent.type(screen.getByRole('searchbox', { name: /search templates/i }), 'photo');
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 3, name: /photography release/i }),
      ).toBeInTheDocument();
    });
    // Activate "Has checkboxes" chip — Photography release has none, so the
    // grid empties out.
    await userEvent.click(screen.getByRole('button', { name: /has checkboxes/i }));
    await waitFor(() => {
      expect(screen.queryByRole('heading', { level: 3, name: /photography release/i })).toBeNull();
    });
    expect(screen.getByRole('status')).toHaveTextContent(/no templates match/i);
  });

  it('Duplicate from the overflow menu inserts a "(copy)" template into the grid', async () => {
    renderPage();
    const original = TEMPLATES[0]!;
    const before = screen.getAllByRole('heading', { level: 3 }).length;
    await userEvent.click(
      screen.getByRole('button', { name: `More actions for ${original.name}` }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: /duplicate/i }));
    expect(
      screen.getByRole('heading', { level: 3, name: `${original.name} (copy)` }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 }).length).toBe(before + 1);
  });
});
