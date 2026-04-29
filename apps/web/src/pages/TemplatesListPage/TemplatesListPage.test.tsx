import { describe, it, expect } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
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
});
