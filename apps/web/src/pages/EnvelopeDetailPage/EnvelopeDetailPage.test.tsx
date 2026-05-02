import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, within, type RenderResult } from '@testing-library/react';
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

    // Disambiguate the duplicated "Withdraw" accessible-name (header button +
    // dialog confirm both share it) by scoping the query to the alertdialog
    // — rule 4.6 prefers role/name queries over positional indexing.
    const dialog = screen.getByRole('alertdialog', { name: /withdraw this envelope\?/i });
    await user.click(within(dialog).getByRole('button', { name: /^withdraw$/i }));

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

  it('routes drafts through DELETE /envelopes/:id (no /cancel) on confirm', async () => {
    mockEnvelope({ status: 'draft' });
    const del = apiClient.delete as unknown as ReturnType<typeof vi.fn>;
    del.mockResolvedValue({ status: 204, data: null });

    renderAt('env-1');
    const user = userEvent.setup();

    const withdraw = await screen.findByRole('button', { name: /withdraw/i });
    await user.click(withdraw);

    // Sanity-check the dialog copy is the draft variant ("permanently
    // removed", not the canceled-notification variant).
    expect(
      await screen.findByRole('heading', { name: /withdraw this envelope\?/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/will be permanently removed/i)).toBeInTheDocument();

    const dialog = screen.getByRole('alertdialog', { name: /withdraw this envelope\?/i });
    await user.click(within(dialog).getByRole('button', { name: /^withdraw$/i }));

    expect(del).toHaveBeenCalledWith('/envelopes/env-1', expect.anything());
    expect(post).not.toHaveBeenCalled();
  });

  it('Esc closes the withdraw confirm dialog without firing the cancel mutation', async () => {
    mockEnvelope({ status: 'awaiting_others' });

    renderAt('env-1');
    const user = userEvent.setup();

    const withdraw = await screen.findByRole('button', { name: /withdraw/i });
    await user.click(withdraw);

    expect(
      await screen.findByRole('alertdialog', { name: /withdraw this envelope\?/i }),
    ).toBeInTheDocument();

    await user.keyboard('{Escape}');

    // Dialog gone, no POST.
    expect(screen.queryByRole('alertdialog', { name: /withdraw this envelope\?/i })).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it('disables the Send reminder button (with a tooltip) when no signer is pending', async () => {
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

    const remind = await screen.findByRole('button', { name: /send reminder/i });
    expect(remind).toBeDisabled();
    expect(remind).toHaveAttribute('title', expect.stringMatching(/closed/i));
    expect(post).not.toHaveBeenCalled();
  });

  it('Send reminder fires once per pending signer and surfaces the success toast', async () => {
    mockEnvelope({
      status: 'awaiting_others',
      signers: [
        {
          id: 's1',
          email: 'maya@example.com',
          name: 'Maya',
          color: '#10B981',
          role: 'signatory',
          signing_order: 1,
          status: 'awaiting',
          viewed_at: null,
          tc_accepted_at: null,
          signed_at: null,
          declined_at: null,
        },
        {
          id: 's2',
          email: 'liam@example.com',
          name: 'Liam',
          color: '#10B981',
          role: 'signatory',
          signing_order: 2,
          status: 'awaiting',
          viewed_at: null,
          tc_accepted_at: null,
          signed_at: null,
          declined_at: null,
        },
      ],
    });
    post.mockResolvedValue({ status: 202, data: null });

    renderAt('env-1');
    const user = userEvent.setup();

    const remind = await screen.findByRole('button', { name: /send reminder/i });
    await user.click(remind);

    const toast = await screen.findByRole('status');
    expect(toast).toHaveTextContent(/Reminder sent to 2 signers\./i);
    expect(post).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenCalledWith('/envelopes/env-1/signers/s1/remind', {}, expect.anything());
    expect(post).toHaveBeenCalledWith('/envelopes/env-1/signers/s2/remind', {}, expect.anything());
  });

  it('shows a danger toast when the cancel mutation fails', async () => {
    mockEnvelope({ status: 'awaiting_others' });
    post.mockRejectedValue(new Error('cannot_cancel_now'));

    renderAt('env-1');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /withdraw/i }));
    const dialog = screen.getByRole('alertdialog', { name: /withdraw this envelope\?/i });
    await user.click(within(dialog).getByRole('button', { name: /^withdraw$/i }));

    const toast = await screen.findByRole('alert');
    expect(toast).toHaveTextContent(/cannot_cancel_now/i);
  });

  it('hides the audit-trail download from the sidebar until the envelope is sealed', async () => {
    mockEnvelope({ status: 'awaiting_others' });
    renderAt('env-1');

    expect(await screen.findByText(/master services agreement/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /download audit trail/i })).toBeNull();
    // The disabled-state copy is shown instead.
    expect(
      screen.getByText(/audit trail PDF will be available once every signer has signed/i),
    ).toBeInTheDocument();
  });

  it('clicking the primary Download original PDF GETs /envelopes/:id/download with kind=original', async () => {
    mockEnvelope({ status: 'awaiting_others' });
    // Stub window.open so the page's "open in new tab" handoff doesn't crash
    // jsdom (which has no real popup target).
    const w = {
      close: vi.fn(),
      closed: false,
      opener: { x: 1 } as unknown,
      location: { href: 'about:blank' },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(window, 'open').mockReturnValue(w as any);
    // The primary download path also calls GET /envelopes/:id/download.
    get.mockImplementation((url: string) => {
      if (url.endsWith('/events')) {
        return Promise.resolve({ data: { events: [] }, status: 200 });
      }
      if (url.endsWith('/download')) {
        return Promise.resolve({
          data: { url: 'https://signed.example/orig.pdf', kind: 'original' },
          status: 200,
        });
      }
      // Fall back to the envelope payload.
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
    const user = userEvent.setup();

    // The DownloadMenu's split button is labeled "Download original" while
    // the envelope is in flight (sealed PDF only becomes the recommended
    // primary once the envelope is completed).
    const dl = await screen.findByRole('button', { name: /download original/i });
    await user.click(dl);

    const toast = await screen.findByRole('status');
    expect(toast).toHaveTextContent(/Original PDF opened in a new tab/i);
    // Confirm we hit the endpoint with kind=original.
    expect(get).toHaveBeenCalledWith(
      '/envelopes/env-1/download',
      expect.objectContaining({ params: expect.objectContaining({ kind: 'original' }) }),
    );
  });

  it('view audit trail (sealed envelope) opens the audit artifact via /download?kind=audit', async () => {
    const w = {
      close: vi.fn(),
      closed: false,
      opener: null as unknown,
      location: { href: 'about:blank' },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(window, 'open').mockReturnValue(w as any);

    get.mockImplementation((url: string) => {
      if (url.endsWith('/events')) {
        return Promise.resolve({ data: { events: [] }, status: 200 });
      }
      if (url.endsWith('/download')) {
        return Promise.resolve({
          data: { url: 'https://signed.example/audit.pdf', kind: 'audit' },
          status: 200,
        });
      }
      return Promise.resolve({
        data: {
          id: 'env-1',
          owner_id: 'u',
          title: 'NDA',
          short_code: 'NDA-1',
          status: 'completed',
          original_pages: 2,
          expires_at: '2030-01-01T00:00:00Z',
          tc_version: '1',
          privacy_version: '1',
          sent_at: '2026-04-01T00:00:00Z',
          completed_at: '2026-04-02T00:00:00Z',
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
          fields: [],
          created_at: '2026-04-01T00:00:00Z',
          updated_at: '2026-04-02T00:00:00Z',
        },
        status: 200,
      });
    });

    renderAt('env-1');
    const user = userEvent.setup();

    const audit = await screen.findByRole('button', { name: /download audit trail/i });
    await user.click(audit);

    const toast = await screen.findByRole('status');
    expect(toast).toHaveTextContent(/Audit trail opened in a new tab/i);
  });

  it('reminder failure: 0 sent, 1 throttled → danger toast', async () => {
    mockEnvelope({ status: 'awaiting_others' });
    post.mockRejectedValue(new Error('throttled'));

    renderAt('env-1');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /send reminder/i }));

    const toast = await screen.findByRole('alert');
    expect(toast).toHaveTextContent(/A signer was reminded in the last hour/i);
  });

  it('reminder partial-failure: 1 sent + 1 throttled → success toast with the split copy', async () => {
    mockEnvelope({
      status: 'awaiting_others',
      signers: [
        {
          id: 's1',
          email: 'maya@example.com',
          name: 'Maya',
          color: '#10B981',
          role: 'signatory',
          signing_order: 1,
          status: 'awaiting',
          viewed_at: null,
          tc_accepted_at: null,
          signed_at: null,
          declined_at: null,
        },
        {
          id: 's2',
          email: 'liam@example.com',
          name: 'Liam',
          color: '#10B981',
          role: 'signatory',
          signing_order: 2,
          status: 'awaiting',
          viewed_at: null,
          tc_accepted_at: null,
          signed_at: null,
          declined_at: null,
        },
      ],
    });
    post.mockResolvedValueOnce({ status: 202, data: null });
    post.mockRejectedValueOnce(new Error('throttled'));

    renderAt('env-1');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /send reminder/i }));

    const toast = await screen.findByRole('status');
    expect(toast).toHaveTextContent(/1 reminder sent · 1 throttled\./i);
  });

  it('draft withdraw error path: DELETE rejects → danger toast (page stays open)', async () => {
    mockEnvelope({ status: 'draft' });
    const del = apiClient.delete as unknown as ReturnType<typeof vi.fn>;
    del.mockRejectedValue(new Error('cannot_delete_now'));

    renderAt('env-1');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /withdraw/i }));
    const dialog = screen.getByRole('alertdialog', { name: /withdraw this envelope\?/i });
    await user.click(within(dialog).getByRole('button', { name: /^withdraw$/i }));

    const toast = await screen.findByRole('alert');
    expect(toast).toHaveTextContent(/cannot_delete_now/i);
    // Did NOT navigate away — the route's BACK sentinel must not be visible.
    expect(screen.queryByText('BACK')).toBeNull();
  });

  it('renders the activity timeline for the full known event set on a completed envelope', async () => {
    // Drive the page through every documented event-type branch in the
    // inline `eventsToTimeline` switch — picks up the per-case render
    // paths the model-level tests cover for the extracted module.
    get.mockImplementation((url: string) => {
      if (url.endsWith('/events')) {
        return Promise.resolve({
          data: {
            events: [
              {
                id: 'e1',
                envelope_id: 'env-1',
                signer_id: null,
                actor_kind: 'sender',
                event_type: 'created',
                ip: null,
                user_agent: null,
                metadata: {},
                created_at: '2026-04-01T00:00:00Z',
              },
              {
                id: 'e2',
                envelope_id: 'env-1',
                signer_id: null,
                actor_kind: 'sender',
                event_type: 'sent',
                ip: null,
                user_agent: null,
                metadata: {},
                created_at: '2026-04-01T00:01:00Z',
              },
              {
                id: 'e3',
                envelope_id: 'env-1',
                signer_id: 's1',
                actor_kind: 'signer',
                event_type: 'viewed',
                ip: null,
                user_agent: null,
                metadata: {},
                created_at: '2026-04-01T00:02:00Z',
              },
              {
                id: 'e4',
                envelope_id: 'env-1',
                signer_id: 's1',
                actor_kind: 'signer',
                event_type: 'signed',
                ip: null,
                user_agent: null,
                metadata: {},
                created_at: '2026-04-01T00:03:00Z',
              },
              {
                id: 'e5',
                envelope_id: 'env-1',
                signer_id: null,
                actor_kind: 'system',
                event_type: 'all_signed',
                ip: null,
                user_agent: null,
                metadata: {},
                created_at: '2026-04-01T00:04:00Z',
              },
              {
                id: 'e6',
                envelope_id: 'env-1',
                signer_id: null,
                actor_kind: 'system',
                event_type: 'sealed',
                ip: null,
                user_agent: null,
                metadata: {},
                created_at: '2026-04-01T00:05:00Z',
              },
              {
                id: 'e7',
                envelope_id: 'env-1',
                signer_id: null,
                actor_kind: 'sender',
                event_type: 'reminder_sent',
                ip: null,
                user_agent: null,
                metadata: {},
                created_at: '2026-04-01T00:02:30Z',
              },
              // The "quiet" set must not appear; tc_accepted is one of them.
              {
                id: 'e8',
                envelope_id: 'env-1',
                signer_id: 's1',
                actor_kind: 'signer',
                event_type: 'tc_accepted',
                ip: null,
                user_agent: null,
                metadata: {},
                created_at: '2026-04-01T00:02:40Z',
              },
            ],
          },
          status: 200,
        });
      }
      return Promise.resolve({
        data: {
          id: 'env-1',
          owner_id: 'u',
          title: 'Master Services Agreement',
          short_code: 'MSA-1',
          status: 'completed',
          original_pages: 4,
          expires_at: '2030-01-01T00:00:00Z',
          tc_version: '1',
          privacy_version: '1',
          sent_at: '2026-04-01T00:00:00Z',
          completed_at: '2026-04-01T00:05:00Z',
          signers: [
            {
              id: 's1',
              email: 'maya@example.com',
              name: 'Maya Raskin',
              color: '#10B981',
              role: 'signatory',
              signing_order: 1,
              status: 'completed',
              viewed_at: '2026-04-01T00:02:00Z',
              tc_accepted_at: '2026-04-01T00:02:40Z',
              signed_at: '2026-04-01T00:03:00Z',
              declined_at: null,
            },
          ],
          fields: [],
          created_at: '2026-04-01T00:00:00Z',
          updated_at: '2026-04-01T00:05:00Z',
        },
        status: 200,
      });
    });

    renderAt('env-1');

    expect(await screen.findByText(/created from PDF upload/i)).toBeInTheDocument();
    expect(screen.getByText(/Sent to 1 signer$/i)).toBeInTheDocument();
    expect(screen.getByText(/Opened the envelope/i)).toBeInTheDocument();
    expect(screen.getByText(/Signed the document/i)).toBeInTheDocument();
    expect(screen.getByText(/All signatures collected/i)).toBeInTheDocument();
    expect(screen.getByText(/Envelope sealed/i)).toBeInTheDocument();
    expect(screen.getByText(/^Reminder sent$/i)).toBeInTheDocument();
    // Quiet event must not have leaked into the rendered timeline.
    expect(screen.queryByText(/tc_accepted/i)).toBeNull();
  });

  it('popup-blocked download fallback: window.open returns null → anchor click + popup-blocked toast', async () => {
    // Simulate a strict popup blocker.
    vi.spyOn(window, 'open').mockReturnValue(null);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    get.mockImplementation((url: string) => {
      if (url.endsWith('/events')) {
        return Promise.resolve({ data: { events: [] }, status: 200 });
      }
      if (url.endsWith('/download')) {
        return Promise.resolve({
          data: { url: 'https://signed.example/seal.pdf', kind: 'sealed' },
          status: 200,
        });
      }
      return Promise.resolve({
        data: {
          id: 'env-1',
          owner_id: 'u',
          title: 'NDA',
          short_code: 'NDA-1',
          status: 'completed',
          original_pages: 2,
          expires_at: '2030-01-01T00:00:00Z',
          tc_version: '1',
          privacy_version: '1',
          sent_at: '2026-04-01T00:00:00Z',
          completed_at: '2026-04-02T00:00:00Z',
          signers: [
            {
              id: 's1',
              email: 'maya@example.com',
              name: 'Maya',
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
          fields: [],
          created_at: '2026-04-01T00:00:00Z',
          updated_at: '2026-04-02T00:00:00Z',
        },
        status: 200,
      });
    });

    renderAt('env-1');
    const user = userEvent.setup();
    // Sealed envelope → primary button is "Download sealed PDF".
    const dl = await screen.findByRole('button', { name: /download sealed pdf/i });
    await user.click(dl);

    const toast = await screen.findByRole('status');
    expect(toast).toHaveTextContent(/check your browser/i);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('back-to-documents on the not-found card lands on /documents', async () => {
    get.mockRejectedValueOnce(Object.assign(new Error('envelope_not_found'), { status: 404 }));
    renderAt('env-missing');

    const back = await screen.findByRole('button', { name: /back to documents/i });
    const user = userEvent.setup();
    await user.click(back);

    expect(await screen.findByText('BACK')).toBeInTheDocument();
  });
});
