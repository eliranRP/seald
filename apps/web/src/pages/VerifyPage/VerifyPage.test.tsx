import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { seald } from '../../styles/theme';

vi.mock('../../lib/api/verifyApiClient', () => ({
  verifyApiClient: {
    get: vi.fn(),
  },
}));

// eslint-disable-next-line import/first
import { verifyApiClient } from '../../lib/api/verifyApiClient';
// eslint-disable-next-line import/first
import { VerifyPage } from './VerifyPage';
// eslint-disable-next-line import/first
import type { VerifyResponse } from '../../features/verify';

const get = verifyApiClient.get as unknown as ReturnType<typeof vi.fn>;

function wrap(initialEntry: string) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <ThemeProvider theme={seald}>
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
              <Route path="/verify/:shortCode" element={children as React.ReactElement} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </ThemeProvider>
    );
  }
  return Wrapper;
}

const SIGNED_PAYLOAD: VerifyResponse = {
  envelope: {
    id: '804a6c00-2ad9-4590-9269-de3e13f61e62',
    title: 'Unconditional Final Waiver and Release',
    short_code: 'u82ZmvdxwG3CU',
    status: 'completed',
    original_pages: 4,
    original_sha256: '7a8afa33b5b077e0486f08fc301e6865caf7b8ea0ea256505df80ea6034c1261',
    sealed_sha256: 'cafebabedeadbeef1234567890abcdef1234567890abcdef1234567890abcdef',
    tc_version: '1',
    privacy_version: '1',
    sent_at: '2026-04-25T21:20:50Z',
    completed_at: '2026-04-25T21:21:08Z',
    expires_at: '2026-05-25T21:20:50Z',
  },
  signers: [
    {
      id: 's1',
      name: 'Ops Ops',
      email: 'ops@nromomentum.com',
      role: 'signer',
      status: 'completed',
      signed_at: '2026-04-25T21:20:55Z',
      declined_at: null,
    },
    {
      id: 's2',
      name: 'Maya Johansson',
      email: 'maya@harriswesthold.com',
      role: 'signer',
      status: 'completed',
      signed_at: '2026-04-25T21:21:05Z',
      declined_at: null,
    },
  ],
  events: [
    {
      id: 'e1',
      actor_kind: 'sender',
      event_type: 'created',
      signer_id: null,
      created_at: '2026-04-25T21:20:50Z',
    },
    {
      id: 'e2',
      actor_kind: 'system',
      event_type: 'sealed',
      signer_id: null,
      created_at: '2026-04-25T21:21:08Z',
    },
  ],
  sealed_url: 'https://signed.example/sealed.pdf',
  audit_url: 'https://signed.example/audit.pdf',
};

const DECLINED_PAYLOAD: VerifyResponse = {
  ...SIGNED_PAYLOAD,
  envelope: { ...SIGNED_PAYLOAD.envelope, status: 'declined', completed_at: null },
  signers: [
    {
      ...SIGNED_PAYLOAD.signers[0]!,
      status: 'declined',
      signed_at: null,
      declined_at: '2026-04-25T21:21:00Z',
    },
    SIGNED_PAYLOAD.signers[1]!,
  ],
  sealed_url: null,
  audit_url: 'https://signed.example/audit.pdf',
};

beforeEach(() => {
  get.mockReset();
});

describe('VerifyPage', () => {
  it('shows a loading state while the query resolves', () => {
    get.mockReturnValue(new Promise(() => {})); // never resolves
    const Wrapper = wrap('/verify/u82ZmvdxwG3CU');
    render(<VerifyPage />, { wrapper: Wrapper });
    expect(screen.getByLabelText(/loading verification/i)).toBeInTheDocument();
  });

  it('renders the envelope title heading on success', async () => {
    get.mockResolvedValueOnce({ data: SIGNED_PAYLOAD });
    const Wrapper = wrap('/verify/u82ZmvdxwG3CU');
    render(<VerifyPage />, { wrapper: Wrapper });
    expect(
      await screen.findByRole('heading', { level: 1, name: /this document is sealed/i }),
    ).toBeInTheDocument();
    // doc title (h2) is also rendered
    expect(
      await screen.findAllByRole('heading', {
        level: 2,
        name: /unconditional final waiver/i,
      }),
    ).not.toHaveLength(0);
  });

  // Regression for the prod blank-page bug: the API emits `tc_accepted`,
  // `field_filled`, `all_signed`, `reminder_sent` event types. The FE's
  // EVENT_LABEL map was missing these; describeEvent then crashed on
  // `EVENT_LABEL[ev.event_type].toLowerCase()` and React un-mounted the
  // entire VerifyPage tree. Asserting the heading still renders catches
  // any future drift between canonical EVENT_TYPES and the FE map.
  it('renders without crashing when the timeline includes every canonical event type', async () => {
    const payload: VerifyResponse = {
      ...SIGNED_PAYLOAD,
      events: [
        {
          id: 'e1',
          actor_kind: 'sender',
          event_type: 'created',
          signer_id: null,
          created_at: '2026-04-25T21:20:50Z',
        },
        {
          id: 'e2',
          actor_kind: 'system',
          event_type: 'sent',
          signer_id: 's1',
          created_at: '2026-04-25T21:20:51Z',
        },
        {
          id: 'e3',
          actor_kind: 'signer',
          event_type: 'viewed',
          signer_id: 's1',
          created_at: '2026-04-25T21:20:52Z',
        },
        {
          id: 'e4',
          actor_kind: 'signer',
          event_type: 'tc_accepted',
          signer_id: 's1',
          created_at: '2026-04-25T21:20:53Z',
        },
        {
          id: 'e5',
          actor_kind: 'signer',
          event_type: 'field_filled',
          signer_id: 's1',
          created_at: '2026-04-25T21:20:54Z',
        },
        {
          id: 'e6',
          actor_kind: 'signer',
          event_type: 'signed',
          signer_id: 's1',
          created_at: '2026-04-25T21:20:55Z',
        },
        {
          id: 'e7',
          actor_kind: 'system',
          event_type: 'all_signed',
          signer_id: null,
          created_at: '2026-04-25T21:21:05Z',
        },
        {
          id: 'e8',
          actor_kind: 'system',
          event_type: 'sealed',
          signer_id: null,
          created_at: '2026-04-25T21:21:08Z',
        },
        {
          id: 'e9',
          actor_kind: 'system',
          event_type: 'reminder_sent',
          signer_id: 's2',
          created_at: '2026-04-25T21:21:10Z',
        },
      ],
    };
    get.mockResolvedValueOnce({ data: payload });
    const Wrapper = wrap('/verify/u82ZmvdxwG3CU');
    render(<VerifyPage />, { wrapper: Wrapper });
    expect(
      await screen.findByRole('heading', { level: 1, name: /this document is sealed/i }),
    ).toBeInTheDocument();
  });

  it('renders all signer names and emails', async () => {
    get.mockResolvedValueOnce({ data: SIGNED_PAYLOAD });
    const Wrapper = wrap('/verify/u82ZmvdxwG3CU');
    render(<VerifyPage />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText('Ops Ops')).toBeInTheDocument();
    });
    expect(screen.getByText('Maya Johansson')).toBeInTheDocument();
    expect(screen.getByText('ops@nromomentum.com')).toBeInTheDocument();
    expect(screen.getByText('maya@harriswesthold.com')).toBeInTheDocument();
  });

  // Regression for the "0 of 1 signed" prod bug. The API emits the
  // canonical signer status `'completed'` (per SIGNER_UI_STATUSES in
  // shared), but the FE used to filter for the legacy `'signed'`
  // string — so the count always rendered 0 even when every signer
  // had finished. Asserting the rendered text catches future drift.
  it('counts canonical "completed" signers in the X of Y badge', async () => {
    get.mockResolvedValueOnce({ data: SIGNED_PAYLOAD });
    const Wrapper = wrap('/verify/u82ZmvdxwG3CU');
    render(<VerifyPage />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText('2 of 2 signed')).toBeInTheDocument();
    });
  });

  it('renders both SHA-256 hashes via accessible labels', async () => {
    get.mockResolvedValueOnce({ data: SIGNED_PAYLOAD });
    const Wrapper = wrap('/verify/u82ZmvdxwG3CU');
    render(<VerifyPage />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByLabelText(/original sha-256 hash/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/sealed sha-256 hash/i)).toBeInTheDocument();
    // The hash text itself is rendered (split visually but still searchable
    // by partial substring).
    expect(screen.getByLabelText(/original sha-256 hash/i).textContent).toContain(
      '7a8afa33b5b077e0486f08fc301e6865',
    );
  });

  it('renders the declined badge when the envelope is declined', async () => {
    get.mockResolvedValueOnce({ data: DECLINED_PAYLOAD });
    const Wrapper = wrap('/verify/u82ZmvdxwG3CU');
    render(<VerifyPage />, { wrapper: Wrapper });
    expect(await screen.findByRole('heading', { level: 1, name: /declined/i })).toBeInTheDocument();
    // The envelope status pill in the "Last activity" row uses the literal
    // status string.
    expect(screen.getAllByText(/declined/i).length).toBeGreaterThan(0);
  });

  it('shows a not-found message when the API returns 404', async () => {
    const err = Object.assign(new Error('envelope_not_found'), { status: 404 });
    get.mockRejectedValueOnce(err);
    const Wrapper = wrap('/verify/missing');
    render(<VerifyPage />, { wrapper: Wrapper });
    expect(
      await screen.findByRole('heading', { name: /couldn't find this envelope/i }),
    ).toBeInTheDocument();
  });

  it('shows a generic error for non-404 failures', async () => {
    const err = Object.assign(new Error('boom'), { status: 500 });
    get.mockRejectedValueOnce(err);
    const Wrapper = wrap('/verify/u82ZmvdxwG3CU');
    render(<VerifyPage />, { wrapper: Wrapper });
    expect(
      await screen.findByRole('heading', { name: /something went wrong/i }),
    ).toBeInTheDocument();
  });
});
