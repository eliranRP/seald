import type { Meta, StoryObj } from '@storybook/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthContext } from '../../providers/AuthProvider';
import type { AuthContextValue } from '../../providers/AuthProvider';
import { AppStateProvider } from '../../providers/AppStateProvider';
import { DashboardPage } from './DashboardPage';

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
  signOut: asyncNoop,
  enterGuestMode: noop,
  exitGuestMode: noop,
};

function Wrap({ children }: { readonly children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return (
    <AuthContext.Provider value={STORY_AUTH}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/documents']}>
          <AppStateProvider>
            <Routes>
              <Route path="/documents" element={children} />
            </Routes>
          </AppStateProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}

const meta: Meta<typeof DashboardPage> = {
  title: 'L4/DashboardPage',
  component: DashboardPage,
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
type Story = StoryObj<typeof DashboardPage>;

export const Default: Story = {
  name: 'Initial render (skeleton rows while envelopes load)',
};
