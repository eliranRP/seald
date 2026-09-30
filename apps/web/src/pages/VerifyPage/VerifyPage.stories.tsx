import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { useState } from 'react';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { verifyApiClient } from '@/lib/api/verifyApiClient';
import { VerifyPage } from './VerifyPage';
import type { VerifyResponse } from '../../features/verify';
import { VERIFY_KEY } from '../../features/verify';

/**
 * Stories prime React-Query's cache with canned data so the page renders
 * deterministically without needing to mock the network. Each story uses
 * a fresh QueryClient so cache state does not leak between cases.
 */

/**
 * Storybook has no global viewport presets. These two options are the
 * widths the design review measures: 390 and 1440. Chromatic modes use
 * the same pair.
 */
const verifyViewports = {
  mobile: {
    name: 'Mobile',
    styles: { width: '390px', height: '844px' },
    type: 'mobile' as const,
  },
  desktop: {
    name: 'Desktop',
    styles: { width: '1440px', height: '900px' },
    type: 'desktop' as const,
  },
};

const meta: Meta<typeof VerifyPage> = {
  title: 'Pages/VerifyPage',
  component: VerifyPage,
  tags: ['autodocs', 'page'],
  parameters: {
    layout: 'fullscreen',
    chromatic: { modes: chromaticViewportModes },
    viewport: { options: verifyViewports },
  },
};
export default meta;
type Story = StoryObj<typeof VerifyPage>;

const SHORT = 'u82ZmvdxwG3CU';

const COMPLETED: VerifyResponse = {
  envelope: {
    id: '804a6c00-2ad9-4590-9269-de3e13f61e62',
    title: 'Unconditional Final Waiver and Release',
    short_code: SHORT,
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
    {
      id: 's3',
      name: 'Jordan Park',
      email: 'jordan@harriswesthold.com',
      role: 'signer',
      status: 'completed',
      signed_at: '2026-04-25T21:21:07Z',
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
      event_type: 'sent',
      signer_id: null,
      created_at: '2026-04-25T21:20:51Z',
    },
    {
      id: 'e3',
      actor_kind: 'signer',
      event_type: 'tc_accepted',
      signer_id: 's1',
      created_at: '2026-04-25T21:20:55Z',
    },
    {
      id: 'e4',
      actor_kind: 'signer',
      event_type: 'signed',
      signer_id: 's1',
      created_at: '2026-04-25T21:20:58Z',
    },
    {
      id: 'e5',
      actor_kind: 'signer',
      event_type: 'signed',
      signer_id: 's2',
      created_at: '2026-04-25T21:21:03Z',
    },
    {
      id: 'e6',
      actor_kind: 'system',
      event_type: 'sealed',
      signer_id: null,
      created_at: '2026-04-25T21:21:08Z',
    },
  ],
  chain_intact: true,
  sealed_url: 'https://example.com/sealed.pdf',
  audit_url: 'https://example.com/audit.pdf',
};

const DECLINED: VerifyResponse = {
  ...COMPLETED,
  envelope: { ...COMPLETED.envelope, status: 'declined', completed_at: null, sealed_sha256: null },
  signers: [
    {
      ...COMPLETED.signers[0]!,
      status: 'declined',
      signed_at: null,
      declined_at: '2026-04-25T21:21:00Z',
    },
    COMPLETED.signers[1]!,
    { ...COMPLETED.signers[2]!, status: 'awaiting', signed_at: null, declined_at: null },
  ],
  events: [
    ...COMPLETED.events.slice(0, 3),
    {
      id: 'e4d',
      actor_kind: 'signer',
      event_type: 'declined',
      signer_id: 's1',
      created_at: '2026-04-25T21:21:00Z',
    },
  ],
  sealed_url: null,
};

const EXPIRED: VerifyResponse = {
  ...COMPLETED,
  envelope: { ...COMPLETED.envelope, status: 'expired', completed_at: null, sealed_sha256: null },
  signers: COMPLETED.signers.map((s) => ({ ...s, status: 'awaiting', signed_at: null })),
  events: [
    COMPLETED.events[0]!,
    COMPLETED.events[1]!,
    {
      id: 'e-expired',
      actor_kind: 'system',
      event_type: 'expired',
      signer_id: null,
      created_at: '2026-05-25T21:20:50Z',
    },
  ],
  sealed_url: null,
  audit_url: null,
};

interface WithDataProps {
  readonly data: VerifyResponse | null;
  readonly forcedState?: 'loading' | 'error';
}

function verifyPayloadResponse(
  payload: VerifyResponse,
  config: InternalAxiosRequestConfig,
): AxiosResponse<VerifyResponse> {
  return {
    data: payload,
    status: 200,
    statusText: 'OK',
    headers: config.headers,
    config,
  };
}

/**
 * The page fetches `GET /verify/:shortCode` on mount. A seeded cache with
 * `gcTime: 0` was collected before the query subscribed, so Storybook
 * showed Axios's "Network Error". The adapter answers that fetch with
 * the story payload, and the cache is kept on a stable client.
 */
function installVerifyMock(payload: VerifyResponse): void {
  verifyApiClient.defaults.adapter = (config) =>
    Promise.resolve(verifyPayloadResponse(payload, config));
}

/**
 * Mounts VerifyPage with a primed React-Query cache so the page renders
 * the chosen state synchronously. For the "loading" story we leave the
 * cache empty. For the "error" story we seed an error into the cache.
 */
function StoryHarness({ data, forcedState }: WithDataProps) {
  if (data) installVerifyMock(data);
  const [qc] = useState(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: Infinity,
          refetchOnMount: false,
          refetchOnWindowFocus: false,
        },
      },
    });
    if (data) {
      client.setQueryData(VERIFY_KEY(SHORT), data);
    }
    return client;
  });
  if (forcedState === 'error') {
    qc.setQueryData(VERIFY_KEY('missing'), undefined);
    qc.getQueryCache()
      .build(qc, {
        queryKey: VERIFY_KEY('missing'),
      })
      .setState({
        status: 'error',
        error: Object.assign(new Error('envelope_not_found'), { status: 404 }),
        fetchStatus: 'idle',
        data: undefined,
        dataUpdateCount: 0,
        dataUpdatedAt: 0,
        errorUpdateCount: 1,
        errorUpdatedAt: Date.now(),
        fetchFailureCount: 1,
        fetchFailureReason: null,
        fetchMeta: null,
        isInvalidated: false,
      });
  }
  const route = forcedState === 'error' ? '/verify/missing' : `/verify/${SHORT}`;
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/verify/:shortCode" element={<VerifyPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

export const Completed: Story = {
  render: () => <StoryHarness data={COMPLETED} />,
};

/** Completed seal at the 390×844 phone viewport. The verdict uses h3. */
export const Mobile: Story = {
  render: () => <StoryHarness data={COMPLETED} />,
  globals: { viewport: { value: 'mobile', isRotated: false } },
  parameters: { chromatic: { modes: { mobile: chromaticViewportModes.mobile } } },
};

/** Completed seal at the 1440×900 desktop viewport. The verdict uses h1. */
export const Desktop: Story = {
  render: () => <StoryHarness data={COMPLETED} />,
  globals: { viewport: { value: 'desktop', isRotated: false } },
  parameters: { chromatic: { modes: { desktop: chromaticViewportModes.desktop } } },
};

export const Declined: Story = {
  render: () => <StoryHarness data={DECLINED} />,
};

export const Expired: Story = {
  render: () => <StoryHarness data={EXPIRED} />,
};

export const Loading: Story = {
  render: () => <StoryHarness data={null} forcedState="loading" />,
};

export const NotFound: Story = {
  render: () => <StoryHarness data={null} forcedState="error" />,
};

/**
 * Tamper-evident audit chain failure. `verifyEventChain` detected a
 * row whose `prev_event_hash` doesn't match the canonical-JSON hash of
 * its predecessor. The page uses the danger ramp (danger-50 wash,
 * danger-700 eyebrow, ShieldAlert mark and integrity icon) instead of
 * the success check. The eyebrow reads "Sealed · audit chain broken",
 * the heading's accessible name is "Sealed; audit chain broken", and
 * the integrity line tells the reader to contact the sender. It does
 * not say the seal is intact or that the document is unchanged.
 *
 * Pinned as its own Chromatic baseline so a regression that drops the
 * badge or swaps the danger color is caught visually on every PR.
 */
export const ChainBroken: Story = {
  render: () => <StoryHarness data={{ ...COMPLETED, chain_intact: false }} />,
};
