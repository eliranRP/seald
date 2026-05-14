import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

function Wrap({ children }: { readonly children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
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
    (Story) => (
      <Wrap>
        <Story />
      </Wrap>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof SentConfirmationPage>;

export const Default: Story = {
  name: 'Initial render (envelope-loading skeleton)',
};
