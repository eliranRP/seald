import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DashboardPage } from './DashboardPage';
import { SentRedirect } from './SentRedirect';
import { renderWithProviders } from '../../test/renderWithProviders';

const mocks = vi.hoisted(() => ({ items: [] as unknown[] }));

vi.mock('../../lib/api/apiClient', () => ({
  apiClient: {
    get: vi.fn(async (url: string) => {
      if (url.startsWith('/envelopes')) {
        return { data: { items: mocks.items, next_cursor: null }, status: 200 };
      }
      return { data: {}, status: 200 };
    }),
    post: vi.fn(async () => ({ data: {}, status: 201 })),
    patch: vi.fn(async () => ({ data: {}, status: 200 })),
    delete: vi.fn(async () => ({ data: null, status: 204 })),
  },
}));

const HOUR = 3_600_000;

function seed(): unknown[] {
  const ago = (ms: number): string => new Date(Date.now() - ms).toISOString();
  const base = {
    original_pages: 2,
    expires_at: '2099-01-01T00:00:00Z',
    tags: [],
    completed_at: null,
  };
  return [
    {
      ...base,
      id: 'env-self',
      title: 'NDA — Quill Capital',
      short_code: 'QX7M2A',
      status: 'awaiting_others',
      sent_at: ago(3 * HOUR),
      created_at: ago(3 * HOUR),
      updated_at: ago(1_000),
      signers: [
        { id: 's1', name: 'Jonah Park', email: 'jonah@example.com', status: 'completed' },
        { id: 's2', name: 'Jamie Doe', email: 'jamie@seald.app', status: 'awaiting' },
      ],
    },
    {
      ...base,
      id: 'env-msa',
      title: 'Advisory agreement — Farrow',
      short_code: 'AD7F2Q',
      status: 'awaiting_others',
      tags: ['Client'],
      sent_at: ago(120 * HOUR),
      created_at: ago(120 * HOUR),
      updated_at: ago(2_000),
      signers: [
        { id: 's3', name: 'Hannah Wills', email: 'hannah@example.com', status: 'awaiting' },
        { id: 's4', name: 'Maya Raskin', email: 'maya@example.com', status: 'awaiting' },
      ],
    },
    {
      ...base,
      id: 'env-offer',
      title: 'Offer letter — M. Chen',
      short_code: '7QX4M2',
      status: 'completed',
      sent_at: ago(130 * HOUR),
      completed_at: ago(100 * HOUR),
      created_at: ago(130 * HOUR),
      updated_at: ago(100 * HOUR),
      signers: [{ id: 's5', name: 'Meilin Chen', email: 'chen@example.com', status: 'completed' }],
    },
    {
      ...base,
      id: 'env-vendor',
      title: 'Vendor onboarding — Argus',
      short_code: 'VA0G3E',
      status: 'draft',
      sent_at: null,
      created_at: ago(500 * HOUR),
      updated_at: ago(500 * HOUR),
      signers: [],
    },
    {
      ...base,
      id: 'env-lease',
      title: 'Lease renewal — 44 Maple',
      short_code: 'LR55QD',
      status: 'declined',
      sent_at: ago(300 * HOUR),
      created_at: ago(300 * HOUR),
      updated_at: ago(290 * HOUR),
      signers: [
        { id: 's6', name: 'Carmen Ortiz', email: 'carmen@example.com', status: 'declined' },
      ],
    },
  ];
}

async function apiMock() {
  const { apiClient } = await import('../../lib/api/apiClient');
  return apiClient as unknown as {
    post: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
}

function renderHome(
  entry: string | { pathname: string; state: unknown } = '/documents',
  options: Parameters<typeof renderWithProviders>[1] = {},
) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/documents" element={<DashboardPage />} />
        <Route path="/document/:id/sent" element={<SentRedirect />} />
        <Route path="/document/new" element={<div>upload page</div>} />
        <Route path="/document/:id" element={<div>detail page</div>} />
      </Routes>
    </MemoryRouter>,
    options,
  );
}

beforeEach(async () => {
  mocks.items = seed();
  const api = await apiMock();
  api.post.mockClear();
  api.patch.mockClear();
});

describe('DashboardPage', () => {
  it('shows the heading, status tabs with counts and rows grouped by recency', async () => {
    renderHome();
    expect(screen.getByRole('heading', { level: 1, name: 'Documents' })).toBeInTheDocument();
    expect(
      await screen.findByRole('checkbox', { name: 'Select Advisory agreement — Farrow' }),
    ).toBeInTheDocument();
    const tabs = screen.getByRole('tablist', { name: 'Status' });
    expect(within(tabs).getByRole('tab', { name: /^All/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(within(tabs).getByRole('tab', { name: /To sign/ })).toHaveTextContent('1');
    expect(within(tabs).getByRole('tab', { name: /Waiting/ })).toHaveTextContent('1');
    expect(within(tabs).getByRole('tab', { name: /Stopped/ })).toHaveTextContent('1');
    expect(screen.getByRole('region', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'This week' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Earlier' })).toBeInTheDocument();
    expect(screen.getByText('5 documents')).toBeInTheDocument();
  });

  it('narrows the table when a tab is picked', async () => {
    renderHome();
    await screen.findByRole('checkbox', { name: 'Select Advisory agreement — Farrow' });
    fireEvent.click(screen.getByRole('tab', { name: /Sealed/ }));
    expect(
      screen.getByRole('checkbox', { name: 'Select Offer letter — M. Chen' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Select Advisory agreement — Farrow' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('1 document')).toBeInTheDocument();
  });

  // Each debounced wait gets 5 s; the test itself gets 20 s so those
  // waits never run into Vitest's 5 s default test timeout.
  const DEBOUNCED = { timeout: 5000 };

  it('searches, shows a removable chip, and the No matches state', async () => {
    renderHome();
    await screen.findByRole('checkbox', { name: 'Select Advisory agreement — Farrow' });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search documents' }), {
      target: { value: 'lease' },
    });
    // Search is debounced (200 ms) before the list re-renders; leave room for
    // a busy runner instead of the 1 s default.
    await waitFor(
      () =>
        expect(
          screen.queryByRole('checkbox', { name: 'Select Advisory agreement — Farrow' }),
        ).not.toBeInTheDocument(),
      DEBOUNCED,
    );
    expect(
      screen.getByRole('checkbox', { name: 'Select Lease renewal — 44 Maple' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove .*lease/i })).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search documents' }), {
      target: { value: 'zebra' },
    });
    expect(await screen.findByText('No matches', undefined, DEBOUNCED)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(
      await screen.findByRole('checkbox', { name: 'Select Advisory agreement — Farrow' }),
    ).toBeInTheDocument();
  }, 20000);

  it('filters by tag from the Tags menu', async () => {
    renderHome();
    await screen.findByRole('checkbox', { name: 'Select Advisory agreement — Farrow' });
    // The date / people / tag menus sit behind one Filter button.
    expect(screen.queryByRole('button', { name: /^Tags:/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    fireEvent.click(screen.getByRole('button', { name: /^Tags:/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'client' }));
    expect(
      screen.queryByRole('checkbox', { name: 'Select Offer letter — M. Chen' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Select Advisory agreement — Farrow' }),
    ).toBeInTheDocument();
  });

  it('states each row status as one sentence', async () => {
    renderHome();
    const row = (await screen.findAllByTestId('doc-row')).find((r) =>
      within(r).queryByText('Advisory agreement — Farrow'),
    );
    expect(row).toBeDefined();
    expect(within(row as HTMLElement).getByText(/^Waiting for /)).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText(/ of \d+ signed$/)).toBeInTheDocument();
  });

  it('puts what needs you in a strip of action cards', async () => {
    renderHome();
    const strip = await screen.findByRole('region', { name: 'Needs you' });
    expect(await within(strip).findByText('NDA — Quill Capital')).toBeInTheDocument();
    expect(within(strip).getByRole('button', { name: 'Sign' })).toBeInTheDocument();
    expect(within(strip).getByRole('button', { name: 'Remind' })).toBeInTheDocument();
    expect(within(strip).getByRole('button', { name: 'Revise' })).toBeInTheDocument();
    fireEvent.click(within(strip).getByRole('button', { name: 'Sign' }));
    expect(await screen.findByText('detail page')).toBeInTheDocument();
  });

  it('reminds every waiting signer from the row action', async () => {
    renderHome();
    await screen.findByRole('checkbox', { name: 'Select Advisory agreement — Farrow' });
    fireEvent.click(screen.getByRole('button', { name: 'Remind Advisory agreement — Farrow' }));
    const api = await apiMock();
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    expect(api.post.mock.calls.map((c) => String(c[0]))).toEqual([
      '/envelopes/env-msa/signers/s3/remind',
      '/envelopes/env-msa/signers/s4/remind',
    ]);
  });

  it('opens a row menu with the document actions', async () => {
    renderHome();
    await screen.findByRole('checkbox', { name: 'Select Advisory agreement — Farrow' });
    fireEvent.click(
      screen.getByRole('button', { name: 'More actions for Advisory agreement — Farrow' }),
    );
    const menu = screen.getByRole('menu', { name: 'Actions for Advisory agreement — Farrow' });
    for (const name of ['Open', 'Remind all', 'Copy link', 'Add tag', 'Cancel request']) {
      expect(within(menu).getByRole('menuitem', { name })).toBeInTheDocument();
    }
  });

  it('replaces the toolbar with a bulk bar once rows are selected', async () => {
    renderHome();
    await screen.findByRole('checkbox', { name: 'Select Advisory agreement — Farrow' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Advisory agreement — Farrow' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Offer letter — M. Chen' }));
    const bar = screen.getByRole('toolbar', { name: 'Bulk actions' });
    expect(within(bar).getByText('2 selected')).toBeInTheDocument();
    for (const name of ['Remind', 'Download', 'Tag', 'Archive']) {
      expect(within(bar).getByRole('button', { name })).toBeInTheDocument();
    }
    fireEvent.click(within(bar).getByRole('button', { name: 'Clear selection' }));
    expect(screen.queryByRole('toolbar', { name: 'Bulk actions' })).not.toBeInTheDocument();
  });

  it('never offers Delete for a sealed document; it can be archived instead', async () => {
    renderHome();
    await screen.findByRole('checkbox', { name: 'Select Offer letter — M. Chen' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Offer letter — M. Chen' }));
    const bar = screen.getByRole('toolbar', { name: 'Bulk actions' });
    expect(within(bar).queryByRole('button', { name: /Delete|Cancel request|Remove/ })).toBeNull();
    expect(within(bar).queryByRole('button', { name: 'Remind' })).toBeNull();
    expect(within(bar).getByRole('button', { name: 'Archive' })).toBeInTheDocument();
  });

  it('offers Delete when every selected document is a draft', async () => {
    renderHome();
    await screen.findByRole('checkbox', { name: 'Select Vendor onboarding — Argus' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Vendor onboarding — Argus' }));
    const bar = screen.getByRole('toolbar', { name: 'Bulk actions' });
    expect(within(bar).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('archives the selection with Undo, and lists archived documents under Archived', async () => {
    mocks.items = seed().map((e) =>
      (e as { id: string }).id === 'env-lease'
        ? { ...(e as object), archived_at: new Date().toISOString() }
        : e,
    );
    renderHome();
    await screen.findByRole('checkbox', { name: 'Select Offer letter — M. Chen' });
    // The archived lease is out of All and counted under Archived.
    expect(screen.queryByText('Lease renewal — 44 Maple')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Archived/ })).toHaveTextContent('1');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Offer letter — M. Chen' }));
    fireEvent.click(
      within(screen.getByRole('toolbar', { name: 'Bulk actions' })).getByRole('button', {
        name: 'Archive',
      }),
    );
    const api = await apiMock();
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/envelopes/env-offer/archive', undefined, {}),
    );
    expect(await screen.findByText('1 document archived')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/envelopes/env-offer/unarchive', undefined, {}),
    );

    fireEvent.click(screen.getByRole('tab', { name: /Archived/ }));
    expect(await screen.findByText('Lease renewal — 44 Maple')).toBeInTheDocument();
  });

  it('offers the three ways to start from the New menu', async () => {
    renderHome();
    await screen.findByRole('checkbox', { name: 'Select Advisory agreement — Farrow' });
    fireEvent.click(screen.getByRole('button', { name: 'More ways to start' }));
    const menu = screen.getByRole('menu', { name: 'New document' });
    expect(within(menu).getByRole('menuitem', { name: 'Upload file' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'From template' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Scan with phone' })).toBeInTheDocument();
  });

  it('shows the first-run block for an account with no documents', async () => {
    mocks.items = [];
    renderHome();
    expect(await screen.findByText('Send your first document')).toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: 'Status' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Choose file' }));
    expect(await screen.findByText('upload page')).toBeInTheDocument();
  });

  it('shows All caught up when nothing waits on you', async () => {
    mocks.items = (seed() as Array<{ id: string }>).filter((e) => e.id !== 'env-self');
    renderHome();
    await screen.findByRole('checkbox', { name: 'Select Advisory agreement — Farrow' });
    fireEvent.click(screen.getByRole('tab', { name: /To sign/ }));
    expect(screen.getByText('All caught up')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View waiting' }));
    expect(screen.getByRole('tab', { name: /Waiting/ })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('DashboardPage after Send', () => {
  it('shows the Sent toast with Undo, and undo returns the document to draft', async () => {
    renderHome({ pathname: '/documents', state: { justSent: 'env-msa' } });
    expect(await screen.findByText('Sent to 2 signers')).toBeInTheDocument();
    const api = await apiMock();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/envelopes/env-msa/unsend', undefined, {}),
    );
    expect(await screen.findByText('Send cancelled · Saved as draft')).toBeInTheDocument();
  });

  it('says so when it is too late to undo', async () => {
    const api = await apiMock();
    api.post.mockRejectedValueOnce({
      response: { status: 409, data: { error: 'unsend_window_expired' } },
    });
    renderHome({ pathname: '/documents', state: { justSent: 'env-msa' } });
    await screen.findByText('Sent to 2 signers');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('Too late to undo')).toBeInTheDocument();
  });

  it('sends a guest from the retired /sent page back to the editor entry', async () => {
    renderHome('/document/env-msa/sent', { auth: { user: null, guest: true } });
    expect(await screen.findByText('upload page')).toBeInTheDocument();
  });

  it('redirects the retired /document/:id/sent page to the list with the same state', async () => {
    renderHome('/document/env-msa/sent');
    expect(await screen.findByText('Sent to 2 signers')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Documents' })).toBeInTheDocument();
  });
});

describe('DashboardPage delivery problems', () => {
  it('fixes a bounced address inline and resends', async () => {
    const items = seed() as Array<{ id: string; signers: Array<{ status: string }> }>;
    const msa = items.find((e) => e.id === 'env-msa');
    if (msa?.signers[0]) msa.signers[0].status = 'bounced';
    mocks.items = items;
    renderHome();
    const strip = await screen.findByRole('region', { name: 'Needs you' });
    await within(strip).findByText(/hannah@example.com/);
    fireEvent.click(within(strip).getByRole('button', { name: 'Fix email' }));
    const field = within(strip).getByLabelText('Email address for Hannah Wills');
    fireEvent.change(field, { target: { value: 'hannah@farow.co' } });
    fireEvent.click(within(strip).getByRole('button', { name: 'Resend' }));
    const api = await apiMock();
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/envelopes/env-msa/signers/s3', {
        email: 'hannah@farow.co',
      }),
    );
    expect(await screen.findByText('Resent to hannah@farow.co')).toBeInTheDocument();
  });
});

describe('DashboardPage on a phone', () => {
  it('lists documents as cards and opens a row sheet from the more button', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    try {
      renderHome();
      await screen.findByRole('button', { name: 'More actions for Offer letter — M. Chen' });
      expect(screen.queryByRole('columnheader')).not.toBeInTheDocument();
      fireEvent.click(
        screen.getByRole('button', { name: 'More actions for Offer letter — M. Chen' }),
      );
      const sheet = await screen.findByRole('dialog', { name: 'Document actions' });
      expect(within(sheet).getByRole('button', { name: 'Download' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /^Filter/ }));
      expect(await screen.findByRole('dialog', { name: 'Filter' })).toBeInTheDocument();
    } finally {
      window.matchMedia = original;
    }
  });
});
