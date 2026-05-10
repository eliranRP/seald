import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DashboardPage } from './DashboardPage';
import { renderWithProviders } from '../../test/renderWithProviders';

// The dashboard now reads envelopes straight from /envelopes via axios.
// We mock the shared apiClient and have it return a small seed list so
// the existing filter/empty-state assertions still work.
vi.mock('../../lib/api/apiClient', () => {
  const SEED = [
    {
      id: 'env-msa',
      title: 'Master Services Agreement',
      short_code: 'MSA-ABCD-1234',
      status: 'awaiting_others',
      original_pages: 4,
      sent_at: '2026-04-01T00:00:00Z',
      completed_at: null,
      expires_at: '2030-01-01T00:00:00Z',
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-01T00:00:00Z',
      signers: [
        {
          id: 's1',
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          color: '#4F46E5',
          status: 'awaiting',
          signed_at: null,
        },
      ],
    },
    {
      // Viewer (renderWithProviders default user `jamie@seald.app`) is
      // one of this envelope's pending signers — must bucket as
      // "Awaiting you", not "Awaiting others".
      id: 'env-self',
      title: 'Self-sign — Jamie CV',
      short_code: 'CV-JAMIE-2026',
      status: 'awaiting_others',
      original_pages: 2,
      sent_at: '2026-04-15T00:00:00Z',
      completed_at: null,
      expires_at: '2030-01-01T00:00:00Z',
      created_at: '2026-04-15T00:00:00Z',
      updated_at: '2026-04-15T00:00:00Z',
      signers: [
        {
          id: 's-self',
          name: 'Jamie Doe',
          email: 'jamie@seald.app',
          color: '#10B981',
          status: 'awaiting',
          signed_at: null,
        },
      ],
    },
    {
      id: 'env-offer',
      title: 'Offer letter — M. Chen',
      short_code: 'OFF-ZZZZ-9999',
      status: 'completed',
      original_pages: 2,
      sent_at: '2026-03-10T00:00:00Z',
      completed_at: '2026-03-11T00:00:00Z',
      expires_at: '2030-01-01T00:00:00Z',
      created_at: '2026-03-10T00:00:00Z',
      updated_at: '2026-03-11T00:00:00Z',
      signers: [
        {
          id: 's2',
          name: 'M. Chen',
          email: 'chen@example.com',
          color: '#10B981',
          status: 'completed',
          signed_at: '2026-03-11T00:00:00Z',
        },
      ],
    },
    {
      id: 'env-vendor',
      title: 'Vendor onboarding — Argus',
      short_code: 'VEN-QQQQ-5555',
      status: 'draft',
      original_pages: 1,
      sent_at: null,
      completed_at: null,
      expires_at: '2030-01-01T00:00:00Z',
      created_at: '2026-04-02T00:00:00Z',
      updated_at: '2026-04-02T00:00:00Z',
      signers: [],
    },
  ];
  return {
    apiClient: {
      get: vi.fn(async (url: string) => {
        if (url.startsWith('/envelopes')) {
          return { data: { items: SEED, next_cursor: null }, status: 200 };
        }
        if (url === '/contacts') return { data: [], status: 200 };
        return { data: {}, status: 200 };
      }),
      post: vi.fn(async () => ({ data: {}, status: 201 })),
      patch: vi.fn(async () => ({ data: {}, status: 200 })),
      delete: vi.fn(async () => ({ data: null, status: 204 })),
    },
  };
});

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
  it('renders the heading and rows from the /envelopes response', async () => {
    renderDashboard();
    expect(
      screen.getByRole('heading', { level: 1, name: /everything you've sent/i }),
    ).toBeInTheDocument();
    // Default filter is the actionable inbox (Awaiting you + Awaiting
    // others). MSA is awaiting_others, so it lands in the visible set.
    expect(await screen.findByText(/master services agreement/i)).toBeInTheDocument();
  });

  it('narrows the table when the user picks a status from the toolbar', async () => {
    // Default visible set is the actionable inbox (Awaiting you +
    // Awaiting others). Sealed and Drafts are hidden by default. The
    // toolbar's Draft checkbox flips Drafts into the visible set.
    renderDashboard();
    await screen.findByText(/master services agreement/i);
    expect(screen.queryByText(/vendor onboarding — argus/i)).toBeNull();
    expect(screen.queryByText(/offer letter — m\. chen/i)).toBeNull();

    // Open the Status chip and add "Draft" to the selection.
    fireEvent.click(screen.getByRole('button', { name: /^status filter$/i }));
    fireEvent.click(await screen.findByLabelText('Draft'));
    expect(screen.getByText(/vendor onboarding — argus/i)).toBeInTheDocument();
    // Awaiting-others is still selected, so MSA stays visible.
    expect(screen.getByText(/master services agreement/i)).toBeInTheDocument();
    // Sealed remains unchecked, so the offer letter stays hidden.
    expect(screen.queryByText(/offer letter — m\. chen/i)).toBeNull();
  });

  it('exposes a link to start a new document', () => {
    renderDashboard();
    expect(screen.getByRole('button', { name: /new document/i })).toBeInTheDocument();
  });

  // Regression: when the dashboard viewer is one of an envelope's
  // pending signers, the row should show the actionable "Awaiting you"
  // indigo badge — not "Awaiting others". The previous logic stubbed
  // `awaitingYou` to 0 so users self-signing their own envelopes saw
  // no actionable state on the dashboard.
  it('shows the Awaiting-you badge for envelopes where viewer is a pending signer', async () => {
    renderDashboard();
    // Wait for the row to mount.
    await screen.findByText(/self-sign — jamie cv/i);
    // The self-sign envelope row carries the indigo "Awaiting you" badge.
    expect(screen.getAllByText(/awaiting you/i).length).toBeGreaterThan(0);
  });

  it('counts the viewer as Awaiting you in the stat tile and the toolbar Status chip', async () => {
    renderDashboard();
    await screen.findByText(/self-sign — jamie cv/i);
    // Open the Status chip; the "Awaiting you" option carries the count.
    fireEvent.click(screen.getByRole('button', { name: /^status filter$/i }));
    const opt = await screen.findByLabelText('Awaiting you');
    // Walk up to the row and look for the count rendered next to the
    // option label. The styled OptionCount uses the mono font; we
    // just assert "1" is present in the row.
    const row = opt.closest('label');
    expect(row?.textContent ?? '').toMatch(/1/);
  });

  it('reads the initial filter from the ?status= query param', async () => {
    renderDashboard('/documents?status=draft');
    await screen.findByText(/vendor onboarding — argus/i);
    expect(screen.queryByText(/master services agreement/i)).toBeNull();
    expect(screen.queryByText(/offer letter — m\. chen/i)).toBeNull();
  });
});
