import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SEALED_DOWNLOAD_KEY, writeDoneSnapshot } from '../../features/signing';
import type { VerifyResponse } from '../../features/verify';
import { SigningDonePage } from './SigningDonePage';

const ENVELOPE_ID = 'env-storybook-001';
const SHORT_CODE = 'STORYBOOKDONE';

// Seed at module load so the first render of the page already sees the
// snapshot in sessionStorage (the page redirects away if it's missing).
if (typeof window !== 'undefined') {
  writeDoneSnapshot({
    kind: 'submitted',
    envelope_id: ENVELOPE_ID,
    short_code: SHORT_CODE,
    title: 'Master Services Agreement',
    sender_name: 'Eliran Azulay',
    recipient_email: 'maya@example.com',
    timestamp: '2026-04-24T00:00:00Z',
  });
}

// Pre-rendered VerifyResponse used to seed the React Query cache. PR #166
// added `useSealedDownload` to SigningDonePage, which calls `useQuery`
// against `GET /verify/:short_code`. Without a QueryClientProvider in the
// story tree, React Query throws "No QueryClient set" at first render and
// Chromatic captures the throw as a component error (build 422+ on main).
// Seeding the cache up-front also short-circuits the polling: the hook's
// refetchInterval returns `false` once `status === 'completed'` and a
// `sealed_url` is present, so the network is never touched in Storybook.
const COMPLETED_VERIFY: VerifyResponse = {
  envelope: {
    id: ENVELOPE_ID,
    title: 'Master Services Agreement',
    short_code: SHORT_CODE,
    status: 'completed',
    original_pages: 2,
    original_sha256: null,
    sealed_sha256: null,
    tc_version: '1',
    privacy_version: '1',
    sent_at: '2026-04-24T00:00:00Z',
    completed_at: '2026-04-24T00:00:08Z',
    expires_at: '2026-05-24T00:00:00Z',
  },
  signers: [],
  events: [],
  chain_intact: true,
  sealed_url: 'https://signed.example/sealed.pdf?sig=storybook',
  audit_url: 'https://signed.example/audit.pdf?sig=storybook',
};

function Wrap({ children }: { readonly children: ReactNode }) {
  // Lazy-init keeps render pure (rule 2.1) — without it, every re-render
  // would mint a new QueryClient and discard the seeded cache. retry:
  // false matches `renderSigningRoute` so a misconfigured story fails
  // loudly instead of silently retrying.
  const [qc] = useState(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0, staleTime: Infinity },
        mutations: { retry: false },
      },
    });
    client.setQueryData(SEALED_DOWNLOAD_KEY(SHORT_CODE), COMPLETED_VERIFY);
    return client;
  });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/sign/${ENVELOPE_ID}/done`]}>
        <Routes>
          <Route path="/sign/:envelopeId/done" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const meta: Meta<typeof SigningDonePage> = {
  title: 'L4/SigningDonePage',
  component: SigningDonePage,
  tags: ['autodocs', 'layer-4'],
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <Wrap>
        <Story />
      </Wrap>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof SigningDonePage>;

export const Default: Story = {
  name: 'Sealed terminal screen',
};
