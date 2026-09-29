import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SIGN_ME_KEY } from '@/features/signing';
import type { SignMeResponse } from '@/features/signing';
import { SigningPrepPage } from './SigningPrepPage';

/** Plain fixture — do not import `makeSignMeResponse` (it pulls in vitest). */
const READY_SESSION: SignMeResponse = {
  envelope: {
    id: 'env-001',
    title: 'Master Services Agreement',
    short_code: 'DOC-ABCD-1234',
    status: 'awaiting_others',
    original_pages: 4,
    expires_at: '2026-10-29T12:00:00.000Z',
    tc_version: '2026-04-24',
    privacy_version: '2026-04-24',
  },
  signer: {
    id: 'signer-001',
    email: 'maya@example.com',
    name: 'Maya Raskin',
    color: '#4F46E5',
    role: 'signatory',
    status: 'viewing',
    viewed_at: null,
    tc_accepted_at: null,
    signed_at: null,
    declined_at: null,
  },
  fields: [],
  other_signers: [],
};

function Wrap({
  children,
  session,
}: {
  readonly children: ReactNode;
  readonly session?: SignMeResponse;
}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  if (session) {
    qc.setQueryData(SIGN_ME_KEY('env-001'), session);
  }
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/sign/env-001/prep']}>
        <Routes>
          <Route path="/sign/:envelopeId/prep" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const meta: Meta<typeof SigningPrepPage> = {
  title: 'L4/SigningPrepPage',
  component: SigningPrepPage,
  tags: ['autodocs', 'layer-4'],
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story, ctx) => {
      const session = ctx.parameters.signSession as SignMeResponse | undefined;
      return session ? (
        <Wrap session={session}>
          <Story />
        </Wrap>
      ) : (
        <Wrap>
          <Story />
        </Wrap>
      );
    },
  ],
};
export default meta;
type Story = StoryObj<typeof SigningPrepPage>;

export const Default: Story = {
  name: 'Initial render (waiting for /sign/me)',
};

/** Populated prep screen: disclosure checkboxes and the signature-level note. */
export const Ready: Story = {
  name: 'Ready to start',
  parameters: { signSession: READY_SESSION },
};
