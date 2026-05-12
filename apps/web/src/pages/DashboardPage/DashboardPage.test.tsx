import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
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

/**
 * The `/envelopes` URLs the mocked apiClient was called with, oldest →
 * newest. With server-side filtering the mock can't actually narrow the
 * list, so the contract we assert is "the request carried the right
 * `?bucket=`/`?q=`/`?sort=` params".
 */
async function envelopeUrls(): Promise<readonly string[]> {
  const { apiClient } = await import('../../lib/api/apiClient');
  const getMock = apiClient.get as unknown as ReturnType<typeof vi.fn>;
  return getMock.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith('/envelopes'));
}

describe('DashboardPage', () => {
  it('renders the heading and every envelope by default (no status filter)', async () => {
    renderDashboard();
    expect(
      screen.getByRole('heading', { level: 1, name: /everything you've sent/i }),
    ).toBeInTheDocument();
    // No default filter — a fresh visit shows the whole list.
    expect(await screen.findByText(/master services agreement/i)).toBeInTheDocument();
    expect(screen.getByText(/vendor onboarding — argus/i)).toBeInTheDocument();
    expect(screen.getByText(/offer letter — m\. chen/i)).toBeInTheDocument();
  });

  it('pushes the picked status bucket onto the /envelopes request (server-side filter)', async () => {
    renderDashboard();
    await screen.findByText(/master services agreement/i);
    // Open the Status chip and pick ONLY "Draft" (no defaults to fight).
    fireEvent.click(screen.getByRole('button', { name: /^status filter$/i }));
    fireEvent.click(await screen.findByLabelText('Draft'));
    await waitFor(async () => {
      expect((await envelopeUrls()).some((u) => /bucket=draft/.test(u))).toBe(true);
    });
    // The toolbar's bucket counts come from a SECOND, unfiltered fetch —
    // so a `bucket`-less request is still in flight alongside the filtered
    // one. (When no filter is active React Query merges the two.)
    expect((await envelopeUrls()).some((u) => !/bucket=/.test(u))).toBe(true);
    // …and the toolbar still shows the full roster of buckets, including
    // the "Sealed" one that the table filter excluded.
    expect(await screen.findByLabelText('Sealed')).toBeInTheDocument();
  });

  it('"Clear filters" drops the bucket param from the /envelopes request', async () => {
    renderDashboard('/documents?status=draft');
    await screen.findByText(/vendor onboarding — argus/i);
    // The initial fetch carried the URL's bucket.
    expect((await envelopeUrls()).some((u) => /bucket=draft/.test(u))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /clear all filters/i }));
    await waitFor(async () => {
      const urls = await envelopeUrls();
      expect(urls[urls.length - 1]).not.toMatch(/bucket=/);
    });
    // Rows are still there (the mock returns the full seed regardless).
    expect(await screen.findByText(/master services agreement/i)).toBeInTheDocument();
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

  it('reads the initial filter from the ?status= query param and forwards it as ?bucket=', async () => {
    renderDashboard('/documents?status=draft');
    await screen.findByText(/vendor onboarding — argus/i);
    expect((await envelopeUrls()).some((u) => /bucket=draft/.test(u))).toBe(true);
  });

  it('forwards the search box text as ?q= on the /envelopes request', async () => {
    renderDashboard('/documents?q=argus');
    await screen.findByText(/vendor onboarding — argus/i);
    expect((await envelopeUrls()).some((u) => /[?&]q=argus/.test(u))).toBe(true);
  });

  it('clicking the "Awaiting others" stat tile toggles its filter (pressed state + bucket query)', async () => {
    renderDashboard();
    await screen.findByText(/master services agreement/i);
    const tile = () => screen.getByRole('button', { name: /awaiting others/i });
    expect(tile()).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(tile());
    await waitFor(() => expect(tile()).toHaveAttribute('aria-pressed', 'true'));
    expect((await envelopeUrls()).some((u) => /bucket=awaiting_others/.test(u))).toBe(true);

    // Clicking the already-active tile clears every filter.
    fireEvent.click(tile());
    await waitFor(() => expect(tile()).toHaveAttribute('aria-pressed', 'false'));
  });

  it('the "Sealed this month" stat tile maps to bucket=sealed + date=thisMonth', async () => {
    renderDashboard();
    await screen.findByText(/master services agreement/i);
    fireEvent.click(screen.getByRole('button', { name: /sealed this month/i }));
    await waitFor(async () => {
      const u = (await envelopeUrls()).at(-1) ?? '';
      expect(u).toMatch(/bucket=sealed/);
      expect(u).toMatch(/date=thisMonth/);
    });
    expect(screen.getByRole('button', { name: /sealed this month/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('the "Avg. turnaround" stat tile is not clickable', async () => {
    renderDashboard();
    await screen.findByText(/master services agreement/i);
    expect(screen.queryByRole('button', { name: /avg\. turnaround/i })).toBeNull();
  });

  it('clicking a column header cycles the server-side sort params and re-queries', async () => {
    // Resolve the mocked apiClient so we can inspect the URLs it was
    // called with — the server does the sort, so the contract we test
    // is "the request carried the right ?sort=&dir=".
    const { apiClient } = await import('../../lib/api/apiClient');
    const getMock = apiClient.get as unknown as ReturnType<typeof vi.fn>;
    const lastEnvelopeUrl = (): string =>
      String(
        [...getMock.mock.calls].reverse().find((c) => String(c[0]).startsWith('/envelopes'))![0],
      );

    renderDashboard();
    await screen.findByText(/master services agreement/i);
    // Initial fetch carries the default sort explicitly (server treats
    // `date desc` the same as no params).
    expect(lastEnvelopeUrl()).toMatch(/sort=date&dir=desc/);

    // Click "Document" → ?sort=title&dir=asc, refetch.
    fireEvent.click(screen.getByRole('button', { name: /^document$/i }));
    await waitFor(() => {
      expect(lastEnvelopeUrl()).toMatch(/sort=title&dir=asc/);
    });
    // The header now advertises its sort direction.
    expect(
      screen.getByRole('button', { name: /^document/i }).closest('[aria-sort]'),
    ).toHaveAttribute('aria-sort', 'ascending');

    // Click again → ?sort=title&dir=desc.
    fireEvent.click(screen.getByRole('button', { name: /^document/i }));
    await waitFor(() => {
      expect(lastEnvelopeUrl()).toMatch(/sort=title&dir=desc/);
    });

    // Click a third time → back to the default order.
    fireEvent.click(screen.getByRole('button', { name: /^document/i }));
    await waitFor(() => {
      expect(lastEnvelopeUrl()).toMatch(/sort=date&dir=desc/);
    });
  });
});
