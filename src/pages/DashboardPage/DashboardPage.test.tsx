import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { DashboardPage } from './DashboardPage';
import { AppStateProvider } from '../../providers/AppStateProvider';
import { seald } from '../../styles/theme';

function renderDashboard(initialPath = '/documents') {
  return render(
    <ThemeProvider theme={seald}>
      <AppStateProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <DashboardPage />
        </MemoryRouter>
      </AppStateProvider>
    </ThemeProvider>,
  );
}

describe('DashboardPage', () => {
  it('renders the Documents heading and seeded rows', () => {
    renderDashboard();
    expect(
      screen.getByRole('heading', { level: 1, name: /everything you've sent/i }),
    ).toBeInTheDocument();
    // The seed data includes Master services agreement.
    expect(screen.getByText(/master services agreement/i)).toBeInTheDocument();
  });

  it('filters the table when a tab is selected', () => {
    renderDashboard();
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
});
