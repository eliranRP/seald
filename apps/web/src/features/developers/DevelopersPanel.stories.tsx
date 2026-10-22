import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ApiKey } from 'shared';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { AuthContext, type AuthContextValue } from '@/providers/AuthProvider';
import { DevelopersPanel } from './DevelopersPanel';
import { API_KEYS_KEY } from './developersApi';
import { fakeKey, fakeKeys } from './fixtures';

// The page reads its list from the React Query cache, so seeding the cache
// keeps every story off the network.
function noop(): void {
  /* story stub */
}
async function asyncNoop(): Promise<void> {
  return Promise.resolve();
}

const AUTH: AuthContextValue = {
  session: null,
  user: { id: 'story-user', email: 'jamie@example.com', name: 'Jamie Okonkwo' },
  guest: false,
  loading: false,
  signInWithPassword: asyncNoop,
  signUpWithPassword: () => Promise.resolve({ needsEmailConfirmation: false }),
  signInWithGoogle: asyncNoop,
  resetPassword: asyncNoop,
  resendSignUpConfirmation: asyncNoop,
  signOut: asyncNoop,
  enterGuestMode: asyncNoop,
  exitGuestMode: noop,
};

function Wrap({
  keys,
  children,
}: {
  readonly keys: ReadonlyArray<ApiKey>;
  readonly children: ReactNode;
}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(API_KEYS_KEY, keys);
  return (
    <AuthContext.Provider value={AUTH}>
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <div style={{ padding: 16 }}>{children}</div>
        </MemoryRouter>
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}

const meta: Meta<typeof DevelopersPanel> = {
  title: 'L4/Settings/DevelopersPanel',
  component: DevelopersPanel,
  tags: ['autodocs', 'layer-4'],
  parameters: {
    layout: 'fullscreen',
    chromatic: { modes: chromaticViewportModes },
  },
};
export default meta;
type Story = StoryObj<typeof DevelopersPanel>;

export const Empty: Story = {
  render: () => (
    <Wrap keys={[]}>
      <DevelopersPanel />
    </Wrap>
  ),
};

export const WithKeys: Story = {
  render: () => (
    <Wrap
      keys={[
        fakeKey({ last_used_at: '2026-10-02T09:00:00.000Z' }),
        fakeKey({
          id: '00000000-0000-4000-8000-000000000002',
          name: 'Key 2',
          prefix: 'seald_live_yyyyyyyy',
          status: 'expired',
          expires_at: '2026-09-01T00:00:00.000Z',
        }),
      ]}
    >
      <DevelopersPanel />
    </Wrap>
  ),
};

export const TenKeys: Story = {
  render: () => (
    <Wrap keys={fakeKeys(10)}>
      <DevelopersPanel />
    </Wrap>
  ),
};
