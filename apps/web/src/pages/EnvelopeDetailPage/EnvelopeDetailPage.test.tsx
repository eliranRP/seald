import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, type RenderResult } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactElement, ReactNode } from 'react';
import { ThemeProvider } from 'styled-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { seald } from '../../styles/theme';

vi.mock('../../lib/api/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// eslint-disable-next-line import/first
import { apiClient } from '../../lib/api/apiClient';
// eslint-disable-next-line import/first
import { EnvelopeDetailPage } from './EnvelopeDetailPage';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;

function renderAt(id: string): RenderResult {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <ThemeProvider theme={seald}>
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={[`/document/${id}`]}>
            <Routes>
              <Route path="/document/:id" element={children as ReactElement} />
              <Route path="/documents" element={<div>BACK</div>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </ThemeProvider>
    );
  }
  return render(<EnvelopeDetailPage />, { wrapper: Wrapper });
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

interface EnvelopeMockOverrides {
  readonly status?: string;
  readonly signers?: ReadonlyArray<Record<string, unknown>>;
}

function mockEnvelope(overrides: EnvelopeMockOverrides = {}): void {
  const defaultSigner = {
    id: 's1',
    email: 'maya@example.com',
    name: 'Maya Raskin',
    color: '#10B981',
    role: 'signatory',
    signing_order: 1,
    status: 'awaiting',
    viewed_at: null,
    tc_accepted_at: null,
    signed_at: null,
    declined_at: null,
  };
  get.mockImplementation((url: string) => {
    if (url.endsWith('/events')) {
      return Promise.resolve({ data: { events: [] }, status: 200 });
    }
    return Promise.resolve({
      data: {
        id: 'env-1',
        owner_id: 'u',
        title: 'Master Services Agreement',
        short_code: 'MSA-ABCD-1234',
        status: overrides.status ?? 'awaiting_others',
        original_pages: 4,
        expires_at: '2030-01-01T00:00:00Z',
        tc_version: '1',
        privacy_version: '1',
        sent_at: '2026-04-01T00:00:00Z',
        completed_at: null,
        signers: overrides.signers ?? [defaultSigner],
        fields: [],
        created_at: '2026-04-01T00:00:00Z',
        updated_at: '2026-04-01T00:00:00Z',
      },
      status: 200,
    });
  });
}

describe('EnvelopeDetailPage', () => {
  it('renders envelope title, short code, and signer list on success', async () => {
    // The detail page now fires two concurrent requests: GET /envelopes/:id
    // and GET /envelopes/:id/events. The events response drives the activity
    // timeline — we return an empty list here.
    get.mockImplementation((url: string) => {
      if (url.endsWith('/events')) {
        return Promise.resolve({ data: { events: [] }, status: 200 });
      }
      return Promise.resolve({
        data: {
          id: 'env-1',
          owner_id: 'u',
          title: 'Master Services Agreement',
          short_code: 'MSA-ABCD-1234',
          status: 'awaiting_others',
          original_pages: 4,
          expires_at: '2030-01-01T00:00:00Z',
          tc_version: '1',
          privacy_version: '1',
          sent_at: '2026-04-01T00:00:00Z',
          completed_at: null,
          signers: [
            {
              id: 's1',
              email: 'maya@example.com',
              name: 'Maya Raskin',
              color: '#10B981',
              role: 'signatory',
              signing_order: 1,
              status: 'awaiting',
              viewed_at: null,
              tc_accepted_at: null,
              signed_at: null,
              declined_at: null,
            },
          ],
          fields: [],
          created_at: '2026-04-01T00:00:00Z',
          updated_at: '2026-04-01T00:00:00Z',
        },
        status: 200,
      });
    });

    renderAt('env-1');

    expect(await screen.findByText(/master services agreement/i)).toBeInTheDocument();
    // The short code appears in both the breadcrumb and the header meta,
    // matching the kit layout — assert it shows at least once.
    expect(screen.getAllByText('MSA-ABCD-1234').length).toBeGreaterThanOrEqual(1);
    // Maya appears in both the signer sidebar and the pending entry on
    // the activity timeline.
    expect(screen.getAllByText(/maya raskin/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/maya@example\.com/i)).toBeInTheDocument();
  });

  it('renders the not-found card when the server returns an error', async () => {
    get.mockRejectedValueOnce(Object.assign(new Error('envelope_not_found'), { status: 404 }));
    renderAt('env-missing');
    expect(
      await screen.findByRole('heading', { level: 1, name: /document not found/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to documents/i })).toBeInTheDocument();
  });

  it('shows skeleton placeholders while the query is pending', () => {
    // Never resolves.
    get.mockImplementationOnce(() => new Promise(() => {}));
    const { container } = renderAt('env-pending');
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('shows the Withdraw button on awaiting_others envelopes and calls cancel on confirm', async () => {
    mockEnvelope({ status: 'awaiting_others' });
    post.mockResolvedValue({
      data: { status: 'canceled', envelope_status: 'canceled' },
      status: 201,
    });

    renderAt('env-1');
    const user = userEvent.setup();

    const withdraw = await screen.findByRole('button', { name: /withdraw/i });
    await user.click(withdraw);

    // Dialog opens with sent-mode copy. The dialog's confirm action also
    // reads "Withdraw" — disambiguate by waiting for the dialog title.
    expect(
      await screen.findByRole('heading', { name: /withdraw this envelope\?/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/will be notified that the request is canceled/i)).toBeInTheDocument();

    const confirmButtons = screen.getAllByRole('button', { name: /^withdraw$/i });
    // The dialog confirm is the last "Withdraw" button rendered (header
    // button is first); click that one to fire the mutation.
    const dialogConfirm = confirmButtons[confirmButtons.length - 1];
    expect(dialogConfirm).toBeDefined();
    await user.click(dialogConfirm!);

    expect(post).toHaveBeenCalledWith('/envelopes/env-1/cancel', undefined, expect.anything());
  });

  it('hides the Withdraw button on completed envelopes', async () => {
    mockEnvelope({
      status: 'completed',
      signers: [
        {
          id: 's1',
          email: 'maya@example.com',
          name: 'Maya Raskin',
          color: '#10B981',
          role: 'signatory',
          signing_order: 1,
          status: 'completed',
          viewed_at: '2026-04-01T00:00:00Z',
          tc_accepted_at: '2026-04-01T00:00:00Z',
          signed_at: '2026-04-01T00:01:00Z',
          declined_at: null,
        },
      ],
    });

    renderAt('env-1');

    expect(await screen.findByText(/master services agreement/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /withdraw/i })).toBeNull();
  });
});
