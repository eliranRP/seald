import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SIGN_ME_KEY } from '@/features/signing';
import type { SignMeResponse } from '@/features/signing';
import { SigningReviewPage } from './SigningReviewPage';

/** Filled fields so the review list and intent note are on screen. */
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
    viewed_at: '2026-09-29T12:00:00.000Z',
    tc_accepted_at: '2026-09-29T12:00:00.000Z',
    signed_at: null,
    declined_at: null,
  },
  fields: [
    {
      id: 'f-name',
      signer_id: 'signer-001',
      kind: 'text',
      page: 1,
      x: 0.1,
      y: 0.2,
      required: true,
      link_id: 'name',
      value_text: 'Maya Raskin',
      filled_at: '2026-09-29T12:05:00.000Z',
    },
    {
      id: 'f-sig',
      signer_id: 'signer-001',
      kind: 'signature',
      page: 2,
      x: 0.1,
      y: 0.7,
      required: true,
      value_text: 'Maya Raskin',
      filled_at: '2026-09-29T12:06:00.000Z',
    },
  ],
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
      <MemoryRouter initialEntries={['/sign/env-001/review']}>
        <Routes>
          <Route path="/sign/:envelopeId/review" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const meta: Meta<typeof SigningReviewPage> = {
  title: 'L4/SigningReviewPage',
  component: SigningReviewPage,
  tags: ['autodocs', 'layer-4'],
  parameters: { layout: 'fullscreen', chromatic: { modes: chromaticViewportModes } },
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
type Story = StoryObj<typeof SigningReviewPage>;

export const Default: Story = {
  name: 'Initial render (loading session)',
};

/** Review screen with filled fields, the intent note, and the seal helper. */
export const Ready: Story = {
  name: 'Ready to submit',
  parameters: { signSession: READY_SESSION },
};
