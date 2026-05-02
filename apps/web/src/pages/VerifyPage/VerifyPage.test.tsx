import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EVENT_TYPES } from 'shared';
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
  chain_intact: true,
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

  // Drift-proof variant of the test above. The hand-curated event list
  // missed three event types (`esign_disclosure_acknowledged`,
  // `intent_to_sign_confirmed`, `consent_withdrawn`) added to the API
  // after this test was written, so a real `/verify/:code` request
  // crashed the page with `Cannot read properties of undefined (reading
  // 'toLowerCase')` inside `describeEvent`. Iterating the canonical
  // `EVENT_TYPES` from `shared` makes the test fail the moment the
  // FE label/tone maps fall behind the source of truth.
  it.each(EVENT_TYPES.map((t) => [t]))(
    'renders without crashing for canonical event_type %s',
    async (eventType) => {
      const payload: VerifyResponse = {
        ...SIGNED_PAYLOAD,
        events: [
          {
            id: `e-${eventType}`,
            actor_kind: 'system',
            event_type: eventType as VerifyResponse['events'][number]['event_type'],
            signer_id: null,
            created_at: '2026-04-25T21:21:08Z',
          },
        ],
      };
      get.mockResolvedValueOnce({ data: payload });
      const Wrapper = wrap('/verify/u82ZmvdxwG3CU');
      render(<VerifyPage />, { wrapper: Wrapper });
      expect(
        await screen.findByRole('heading', { level: 1, name: /this document is sealed/i }),
      ).toBeInTheDocument();
    },
  );

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

  // Verdict-hero variants — `deriveView` has one branch per envelope
  // status. Without these the FE can render the wrong eyebrow/heading
  // for terminal-but-not-completed envelopes (expired / canceled) and
  // for the in-progress fallback. The strings are part of the public
  // verify contract per Design-Guide/project/verify-flow.html so a
  // copy regression is a real bug, not a cosmetic test.
  it('renders the expired verdict for an expired envelope', async () => {
    const payload: VerifyResponse = {
      ...SIGNED_PAYLOAD,
      envelope: { ...SIGNED_PAYLOAD.envelope, status: 'expired', completed_at: null },
      sealed_url: null,
    };
    get.mockResolvedValueOnce({ data: payload });
    const Wrapper = wrap('/verify/u82ZmvdxwG3CU');
    render(<VerifyPage />, { wrapper: Wrapper });
    expect(
      await screen.findByRole('heading', { level: 1, name: /this envelope.*expired/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/expired · not sealed/i)).toBeInTheDocument();
  });

  it('renders the canceled verdict for a canceled envelope', async () => {
    const payload: VerifyResponse = {
      ...SIGNED_PAYLOAD,
      envelope: { ...SIGNED_PAYLOAD.envelope, status: 'canceled', completed_at: null },
      sealed_url: null,
    };
    get.mockResolvedValueOnce({ data: payload });
    const Wrapper = wrap('/verify/u82ZmvdxwG3CU');
    render(<VerifyPage />, { wrapper: Wrapper });
    expect(
      await screen.findByRole('heading', { level: 1, name: /this envelope was.*canceled/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/canceled · not sealed/i)).toBeInTheDocument();
  });

  // Falls through `deriveView` for every status that isn't completed /
  // declined / expired / canceled (draft, awaiting_others, sealing).
  // The integrity copy on this branch is "X of Y signatures recorded"
  // — historically the place we got the "0 of N" prod bug.
  it('renders the in-progress verdict and "X of Y signatures recorded" copy for awaiting_others', async () => {
    const payload: VerifyResponse = {
      ...SIGNED_PAYLOAD,
      envelope: {
        ...SIGNED_PAYLOAD.envelope,
        status: 'awaiting_others',
        completed_at: null,
      },
      signers: [
        { ...SIGNED_PAYLOAD.signers[0]! },
        {
          ...SIGNED_PAYLOAD.signers[1]!,
          status: 'awaiting',
          signed_at: null,
        },
      ],
      sealed_url: null,
    };
    get.mockResolvedValueOnce({ data: payload });
    const Wrapper = wrap('/verify/u82ZmvdxwG3CU');
    render(<VerifyPage />, { wrapper: Wrapper });
    expect(
      await screen.findByRole('heading', { level: 1, name: /awaiting.*signatures/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/in progress/i)).toBeInTheDocument();
    // "1 of 2 signatures recorded." — the IntegrityCopy in-progress branch
    // composes "{done} of {all} signatures recorded." across two nodes.
    expect(screen.getByText(/1 of 2 signatures recorded/i)).toBeInTheDocument();
    // No download button when the envelope isn't sealed yet.
    expect(screen.queryByRole('link', { name: /download/i })).not.toBeInTheDocument();
  });

  // Awaiting / viewing signers must render no status icon (the spec only
  // shows an icon for `completed` and `declined`). Without this branch
  // covered, the SVG-rendering helper SignerStatusIcon could regress
  // and start rendering an empty <svg> for awaiting signers (visible
  // empty circle on the page).
  it('renders no signer status icon for awaiting signers', async () => {
    const payload: VerifyResponse = {
      ...SIGNED_PAYLOAD,
      envelope: { ...SIGNED_PAYLOAD.envelope, status: 'awaiting_others', completed_at: null },
      signers: [
        {
          ...SIGNED_PAYLOAD.signers[0]!,
          status: 'awaiting',
          signed_at: null,
        },
      ],
    };
    get.mockResolvedValueOnce({ data: payload });
    const Wrapper = wrap('/verify/u82ZmvdxwG3CU');
    const { container } = render(<VerifyPage />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText('Ops Ops')).toBeInTheDocument();
    });
    // Aria-hidden checkmark/x SVGs only exist for completed/declined.
    // For awaiting, the SignerCheck is rendered empty.
    const polylines = container.querySelectorAll('polyline');
    // The verdict mark is a polyline only on the success/in-progress
    // branch; in-progress uses a circle+path (clock), so no polyline
    // should leak in for an awaiting signer row.
    expect(polylines.length).toBe(0);
  });

  // actorLabel fallback — when the API emits an actor_kind we don't
  // explicitly handle (only 'sender'/'signer'/'system' are valid today,
  // but the union may grow), the function returns the literal "Signer".
  // Covering the fallback protects against silent label drift.
  it('labels a system event with no signer_id as "Sealed system" in the timeline', async () => {
    const payload: VerifyResponse = {
      ...SIGNED_PAYLOAD,
      events: [
        {
          id: 'sys-1',
          actor_kind: 'system',
          event_type: 'sealed',
          signer_id: null,
          created_at: '2026-04-25T21:21:08Z',
        },
      ],
    };
    get.mockResolvedValueOnce({ data: payload });
    const Wrapper = wrap('/verify/u82ZmvdxwG3CU');
    render(<VerifyPage />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText(/sealed system/i)).toBeInTheDocument();
    });
  });

  it('falls back to "Signer" actor label when a signer_id has no matching roster entry', async () => {
    const payload: VerifyResponse = {
      ...SIGNED_PAYLOAD,
      // signer_id points to a roster row that no longer exists (e.g.
      // signer was hard-deleted by retention but the event row remains).
      events: [
        {
          id: 'orphan-1',
          actor_kind: 'signer',
          event_type: 'viewed',
          signer_id: 'ghost-id',
          created_at: '2026-04-25T21:20:55Z',
        },
      ],
    };
    get.mockResolvedValueOnce({ data: payload });
    const Wrapper = wrap('/verify/u82ZmvdxwG3CU');
    render(<VerifyPage />, { wrapper: Wrapper });
    await waitFor(() => {
      // The actor column on the orphaned row falls back to "Signer".
      // The signer roster also renders names; "Signer" alone (not in a
      // signer-name row) is the actor cell text.
      const matches = screen.getAllByText(/^signer$/i);
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  // Ensures the warn-tone branch in `toneFor` is exercised (declined /
  // expired / canceled / job_failed / retention_deleted /
  // session_invalidated_by_decline). Without this, a CSS regression
  // could ship a missing warning style for terminal failure events.
  it('renders job_failed and retention_deleted events without crashing (warn-tone branch)', async () => {
    const payload: VerifyResponse = {
      ...SIGNED_PAYLOAD,
      events: [
        {
          id: 'jf',
          actor_kind: 'system',
          event_type: 'job_failed',
          signer_id: null,
          created_at: '2026-04-25T21:21:00Z',
        },
        {
          id: 'rd',
          actor_kind: 'system',
          event_type: 'retention_deleted',
          signer_id: null,
          created_at: '2026-04-25T21:22:00Z',
        },
        {
          id: 'sid',
          actor_kind: 'system',
          event_type: 'session_invalidated_by_decline',
          signer_id: null,
          created_at: '2026-04-25T21:23:00Z',
        },
        {
          id: 'sic',
          actor_kind: 'system',
          event_type: 'session_invalidated_by_cancel',
          signer_id: null,
          created_at: '2026-04-25T21:24:00Z',
        },
      ],
    };
    get.mockResolvedValueOnce({ data: payload });
    const Wrapper = wrap('/verify/u82ZmvdxwG3CU');
    render(<VerifyPage />, { wrapper: Wrapper });
    expect(
      await screen.findByRole('heading', { level: 1, name: /this document is sealed/i }),
    ).toBeInTheDocument();
    // Each event renders the label twice (timeline title + describe line),
    // so we assert at-least-one match rather than uniqueness.
    expect(screen.getAllByText(/sealing job failed/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/document retention expired/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^session invalidated$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/session invalidated \(cancel\)/i).length).toBeGreaterThan(0);
  });

  // Loading state must announce itself to assistive tech via aria-busy
  // + role=polite. The skill spec lists this as the loading-state
  // accessibility contract.
  it('marks the loading skeleton with aria-busy for assistive tech', () => {
    get.mockReturnValue(new Promise(() => {}));
    const Wrapper = wrap('/verify/u82ZmvdxwG3CU');
    render(<VerifyPage />, { wrapper: Wrapper });
    const region = screen.getByLabelText(/loading verification/i);
    expect(region).toHaveAttribute('aria-busy');
  });

  // Error-render branch when the thrown error has a message but no
  // `status` (e.g. a network failure surfaces "Network Error" with no
  // HTTP response). The page should fall back to the generic heading
  // and use the error message as the body copy.
  it('renders the generic error heading with the error message when status is missing', async () => {
    const err = new Error('Network down — connection lost');
    get.mockRejectedValueOnce(err);
    const Wrapper = wrap('/verify/u82ZmvdxwG3CU');
    render(<VerifyPage />, { wrapper: Wrapper });
    expect(
      await screen.findByRole('heading', { name: /something went wrong/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/network down — connection lost/i)).toBeInTheDocument();
  });

  // Error path with neither a status nor a message — should still render
  // the generic error panel with default copy. Guards against a blank
  // page if the API ever throws a bare `Error()` without context.
  it('renders the default error copy when the error has no status and no message', async () => {
    const err = new Error('');
    get.mockRejectedValueOnce(err);
    const Wrapper = wrap('/verify/u82ZmvdxwG3CU');
    render(<VerifyPage />, { wrapper: Wrapper });
    expect(
      await screen.findByRole('heading', { name: /something went wrong/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/try again in a moment/i)).toBeInTheDocument();
  });

  // Page-count copy: "1 page" vs "N pages". Both branches matter for
  // the doc subtitle line (rendered only when original_pages !== null).
  it('renders singular "page" when the document has exactly one page', async () => {
    const payload: VerifyResponse = {
      ...SIGNED_PAYLOAD,
      envelope: { ...SIGNED_PAYLOAD.envelope, original_pages: 1 },
    };
    get.mockResolvedValueOnce({ data: payload });
    const Wrapper = wrap('/verify/u82ZmvdxwG3CU');
    render(<VerifyPage />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText(/^1 page$/i)).toBeInTheDocument();
    });
  });

  // The download button must only render when a sealed_url is present.
  // Sealed-but-no-URL (presigner failure / retention deletion) should
  // hide it cleanly rather than rendering an empty link.
  it('hides the Download button when sealed_url is null', async () => {
    const payload: VerifyResponse = {
      ...SIGNED_PAYLOAD,
      sealed_url: null,
      audit_url: null,
    };
    get.mockResolvedValueOnce({ data: payload });
    const Wrapper = wrap('/verify/u82ZmvdxwG3CU');
    render(<VerifyPage />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /this document is sealed/i }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole('link', { name: /download/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /audit pdf/i })).not.toBeInTheDocument();
  });

  // Both pre-signed URL buttons render with `target="_blank"` +
  // `rel="noopener noreferrer"` — losing rel=noopener on a link to a
  // signed S3 URL is a tab-jacking vector, so it gets a regression test.
  it('opens the Download and Audit PDF links in a new tab with rel=noopener noreferrer', async () => {
    get.mockResolvedValueOnce({ data: SIGNED_PAYLOAD });
    const Wrapper = wrap('/verify/u82ZmvdxwG3CU');
    render(<VerifyPage />, { wrapper: Wrapper });
    const dl = await screen.findByRole('link', { name: /download/i });
    expect(dl).toHaveAttribute('href', SIGNED_PAYLOAD.sealed_url!);
    expect(dl).toHaveAttribute('target', '_blank');
    expect(dl).toHaveAttribute('rel', 'noopener noreferrer');
    const audit = screen.getByRole('link', { name: /audit pdf/i });
    expect(audit).toHaveAttribute('href', SIGNED_PAYLOAD.audit_url!);
    expect(audit).toHaveAttribute('rel', 'noopener noreferrer');
  });

  // Defensive: a sealed envelope with NO recorded events (e.g. retention
  // wiped them, or an old envelope from before the audit-chain landed)
  // must still render the verdict + card without crashing on the timeline
  // mapping. Without this, an upstream bug that returns events:[] could
  // render a missing "Activity · 0 events" header.
  it('renders the timeline header as "0 events" when the events array is empty', async () => {
    const payload: VerifyResponse = { ...SIGNED_PAYLOAD, events: [] };
    get.mockResolvedValueOnce({ data: payload });
    const Wrapper = wrap('/verify/u82ZmvdxwG3CU');
    render(<VerifyPage />, { wrapper: Wrapper });
    expect(
      await screen.findByRole('heading', { level: 1, name: /this document is sealed/i }),
    ).toBeInTheDocument();
    // The Timeline header copy includes a singular/plural branch on the
    // event count; the zero case must use the plural "events" form per
    // the design guide ("0 events", not "0 event").
    expect(screen.getByText(/activity · 0 events/i)).toBeInTheDocument();
  });

  // Defensive: a SignersFact rendered with zero signers historically
  // crashed because the badge ("X of Y signed") divided by zero in a
  // previous prototype. The current code computes `signed = filter().length`
  // and `signers.length` so the math is safe; this test pins that contract.
  it('renders "0 of 0 signed" without crashing for an envelope with no signers', async () => {
    const payload: VerifyResponse = { ...SIGNED_PAYLOAD, signers: [] };
    get.mockResolvedValueOnce({ data: payload });
    const Wrapper = wrap('/verify/u82ZmvdxwG3CU');
    render(<VerifyPage />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText(/0 of 0 signed/i)).toBeInTheDocument();
    });
  });

  // The footer's trust statements are public claims (PAdES-LT, RFC 3161,
  // AES-256). Removing them silently would weaken the user's verification
  // confidence; pin them so a copy refactor needs to acknowledge the
  // change.
  it('renders the public trust footer with all three guarantees', async () => {
    get.mockResolvedValueOnce({ data: SIGNED_PAYLOAD });
    const Wrapper = wrap('/verify/u82ZmvdxwG3CU');
    render(<VerifyPage />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText(/aes-256 at rest/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/rfc 3161 timestamps/i)).toBeInTheDocument();
    expect(screen.getByText(/pades-lt seal/i)).toBeInTheDocument();
    expect(screen.getByText(/verification by seald, inc/i)).toBeInTheDocument();
  });

  // Verification URL is rendered in the facts panel using the literal
  // `seald.nromomentum.com/verify/{short_code}` string (used by the QR
  // code on the audit PDF). A regression where the wrong domain or path
  // shipped would silently break the QR loop.
  it('renders the public verification URL using the canonical seald.nromomentum.com domain', async () => {
    get.mockResolvedValueOnce({ data: SIGNED_PAYLOAD });
    const Wrapper = wrap('/verify/u82ZmvdxwG3CU');
    render(<VerifyPage />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText('seald.nromomentum.com/verify/u82ZmvdxwG3CU')).toBeInTheDocument();
    });
  });

  // The "REQ ABCD-EFGH" header pulls the first two UUID groups from the
  // envelope id and uppercases them. Regressing the slice or the case
  // would silently break the design guide spec at line 586.
  it('renders the REQ id as the first two UUID groups, uppercased', async () => {
    get.mockResolvedValueOnce({ data: SIGNED_PAYLOAD });
    const Wrapper = wrap('/verify/u82ZmvdxwG3CU');
    render(<VerifyPage />, { wrapper: Wrapper });
    await waitFor(() => {
      // SIGNED_PAYLOAD.envelope.id = '804a6c00-2ad9-4590-…'
      expect(screen.getByText('REQ 804A6C00-2AD9')).toBeInTheDocument();
    });
  });

  // ---- Audit-chain badge (regression: API has returned `chain_intact`
  // since Sprint 3 / PR #10 but the FE never surfaced it; the prompt's
  // bug-floor calls this out explicitly. The verdict copy claims the
  // seal is intact, but a tampered audit log is a separate trust
  // failure — the user must see both checks). ------------------------

  it('renders an audit-chain "intact" badge when chain_intact=true', async () => {
    get.mockResolvedValueOnce({ data: { ...SIGNED_PAYLOAD, chain_intact: true } });
    const Wrapper = wrap('/verify/u82ZmvdxwG3CU');
    render(<VerifyPage />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByLabelText(/audit chain status/i)).toBeInTheDocument();
    });
    const badge = screen.getByLabelText(/audit chain status/i);
    expect(badge).toHaveTextContent(/intact/i);
  });

  it('renders an audit-chain "broken" warning when chain_intact=false', async () => {
    get.mockResolvedValueOnce({ data: { ...SIGNED_PAYLOAD, chain_intact: false } });
    const Wrapper = wrap('/verify/u82ZmvdxwG3CU');
    render(<VerifyPage />, { wrapper: Wrapper });
    await waitFor(() => {
      const badge = screen.getByLabelText(/audit chain status/i);
      expect(badge).toHaveTextContent(/broken|tamper/i);
    });
  });

  // ---- Download attribute (regression: prompt's bug-floor list says
  // "Sealed-PDF download button no `download` attribute (opens in tab
  // instead of saving)". The button copy says "Download" so users
  // expect their browser to save the file with a friendly name —
  // without `download`, browsers open the PDF inline and the file
  // gets saved as the S3 presigned-URL path which is unreadable.) -----

  it('sets a download attribute on the sealed-PDF Download link so browsers save instead of opening in a tab', async () => {
    get.mockResolvedValueOnce({ data: SIGNED_PAYLOAD });
    const Wrapper = wrap('/verify/u82ZmvdxwG3CU');
    render(<VerifyPage />, { wrapper: Wrapper });
    const dl = await screen.findByRole('link', { name: /^download$/i });
    expect(dl).toHaveAttribute('download');
    // The download filename should be a friendly, hash-free name derived
    // from the envelope title (with a .pdf extension), not the raw S3
    // presigned-URL path which contains opaque query strings.
    const dlFilename = dl.getAttribute('download');
    expect(dlFilename).toMatch(/\.pdf$/i);
    expect(dlFilename).not.toMatch(/^https?:/);
  });

  it('sets a download attribute on the Audit PDF link', async () => {
    get.mockResolvedValueOnce({ data: SIGNED_PAYLOAD });
    const Wrapper = wrap('/verify/u82ZmvdxwG3CU');
    render(<VerifyPage />, { wrapper: Wrapper });
    const audit = await screen.findByRole('link', { name: /audit pdf/i });
    expect(audit).toHaveAttribute('download');
    const auditFilename = audit.getAttribute('download');
    expect(auditFilename).toMatch(/audit/i);
    expect(auditFilename).toMatch(/\.pdf$/i);
  });

  // When the API omits `original_pages` (legacy envelope, sealing failure)
  // the doc subtitle should render an em dash placeholder + the
  // singular/plural branch should default to "pages" (plural).
  it('renders "— pages" when original_pages is null', async () => {
    const payload: VerifyResponse = {
      ...SIGNED_PAYLOAD,
      envelope: { ...SIGNED_PAYLOAD.envelope, original_pages: null },
    };
    get.mockResolvedValueOnce({ data: payload });
    const Wrapper = wrap('/verify/u82ZmvdxwG3CU');
    render(<VerifyPage />, { wrapper: Wrapper });
    await waitFor(() => {
      // The DocSub renders the "— pages" segment; assert by partial match
      // since the element splits the value across spans.
      expect(screen.getByText(/—\s*pages/i)).toBeInTheDocument();
    });
  });
});
