import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Envelope } from 'shared';
import { envelopeKeys } from '@/features/envelopes';
import { AuthContext } from '../../providers/AuthProvider';
import type { AuthContextValue } from '../../providers/AuthProvider';
import { AppStateProvider } from '../../providers/AppStateProvider';
import { SentConfirmationPage } from './SentConfirmationPage';

async function asyncNoop(): Promise<void> {
  return Promise.resolve();
}
async function asyncSignUp(): Promise<{ readonly needsEmailConfirmation: boolean }> {
  return { needsEmailConfirmation: false };
}
function noop(): void {
  /* storybook stub */
}

const STORY_AUTH: AuthContextValue = {
  session: null,
  user: { id: 'u1', email: 'jamie@seald.app', name: 'Jamie Okonkwo' },
  guest: false,
  loading: false,
  signInWithPassword: asyncNoop,
  signUpWithPassword: asyncSignUp,
  signInWithGoogle: asyncNoop,
  resetPassword: asyncNoop,
  resendSignUpConfirmation: asyncNoop,
  signOut: asyncNoop,
  enterGuestMode: asyncNoop,
  exitGuestMode: noop,
};

const SENT_ENVELOPE: Envelope = {
  id: 'env-1',
  owner_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  title: 'Master Services Agreement',
  short_code: 'DOC-ABCD-1234',
  status: 'awaiting_others',
  delivery_mode: 'parallel',
  original_pages: 4,
  original_sha256: null,
  sealed_sha256: null,
  sender_email: 'jamie@seald.app',
  sender_name: 'Jamie Okonkwo',
  sent_at: '2026-09-29T12:00:00.000Z',
  completed_at: null,
  expires_at: '2026-10-29T12:00:00.000Z',
  tc_version: '2026-04-24',
  privacy_version: '2026-04-24',
  tags: [],
  created_at: '2026-09-29T11:00:00.000Z',
  updated_at: '2026-09-29T12:00:00.000Z',
  signers: [
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      email: 'maya@example.com',
      name: 'Maya Raskin',
      color: '#4F46E5',
      role: 'signatory',
      signing_order: 1,
      status: 'awaiting',
      viewed_at: null,
      tc_accepted_at: null,
      signed_at: null,
      declined_at: null,
    },
    {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      email: 'jonah@example.com',
      name: 'Jonah Park',
      color: '#F59E0B',
      role: 'signatory',
      signing_order: 2,
      status: 'awaiting',
      viewed_at: null,
      tc_accepted_at: null,
      signed_at: null,
      declined_at: null,
    },
  ],
  fields: [],
};

function Wrap({
  children,
  envelope,
}: {
  readonly children: ReactNode;
  readonly envelope?: Envelope;
}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  if (envelope) {
    qc.setQueryData(envelopeKeys.detail('env-1'), envelope);
  }
  return (
    <AuthContext.Provider value={STORY_AUTH}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/sent/env-1']}>
          <AppStateProvider>
            <Routes>
              <Route path="/sent/:id" element={children} />
            </Routes>
          </AppStateProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}

const meta: Meta<typeof SentConfirmationPage> = {
  title: 'L4/SentConfirmationPage',
  component: SentConfirmationPage,
  tags: ['autodocs', 'layer-4'],
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story, ctx) => {
      const envelope = ctx.parameters.envelope as Envelope | undefined;
      return envelope ? (
        <Wrap envelope={envelope}>
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
type Story = StoryObj<typeof SentConfirmationPage>;

export const Default: Story = {
  name: 'Initial render (envelope-loading skeleton)',
};

/** Sent card with the progress note, signer list, and retention line. */
export const Sent: Story = {
  name: 'Envelope sent',
  parameters: { envelope: SENT_ENVELOPE },
};
