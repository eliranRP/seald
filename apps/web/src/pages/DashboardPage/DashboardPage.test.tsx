import { describe, expect, it } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DashboardPage } from './DashboardPage';
import { renderWithProviders } from '../../test/renderWithProviders';

function renderDashboard(initialPath = '/documents') {
  return renderWithProviders(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/documents" element={<DashboardPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DashboardPage', () => {
  it('renders the Documents heading and seeded rows', async () => {
    renderDashboard();
    expect(
      screen.getByRole('heading', { level: 1, name: /everything you've sent/i }),
    ).toBeInTheDocument();
    // The seed data (fetched async from the mock API) includes Master services agreement.
    expect(await screen.findByText(/master services agreement/i)).toBeInTheDocument();
  });

  it('filters the table when a tab is selected', async () => {
    renderDashboard();
    // Wait for seed data to hydrate before interacting with tabs.
    await screen.findByText(/master services agreement/i);
    fireEvent.click(screen.getByRole('tab', { name: /drafts/i }));
    // Vendor onboarding is the only draft seed.
    expect(screen.getByText(/vendor onboarding — argus/i)).toBeInTheDocument();
    // Completed docs should no longer be visible.
    expect(screen.queryByText(/offer letter — m\. chen/i)).toBeNull();
  });

  it('exposes a link to start a new document', () => {
    renderDashboard();
    expect(screen.getByRole('button', { name: /new document/i })).toBeInTheDocument();
  });

  it('reads the initial filter from the ?filter= query param', async () => {
    renderDashboard('/documents?filter=drafts');
    // Wait for seed hydration.
    await screen.findByText(/vendor onboarding — argus/i);
    // Drafts tab should be rendered as active on first paint, driven by the URL.
    const draftsTab = screen.getByRole('tab', { name: /drafts/i });
    expect(draftsTab).toHaveAttribute('aria-selected', 'true');
    // Non-draft seed rows must be filtered out.
    expect(screen.queryByText(/master services agreement/i)).toBeNull();
    expect(screen.queryByText(/offer letter — m\. chen/i)).toBeNull();
  });
});
