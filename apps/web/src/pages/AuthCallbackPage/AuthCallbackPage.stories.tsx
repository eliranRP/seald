import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../../providers/AuthProvider';
import type { AuthContextValue } from '../../providers/AuthProvider';
import { AuthCallbackPage } from './AuthCallbackPage';

async function asyncNoop(): Promise<void> {
  return Promise.resolve();
}
async function asyncSignUp(): Promise<{ readonly needsEmailConfirmation: boolean }> {
  return { needsEmailConfirmation: false };
}
function noop(): void {
  /* storybook stub */
}

const LOADING_AUTH: AuthContextValue = {
  session: null,
  user: null,
  guest: false,
  loading: true,
  signInWithPassword: asyncNoop,
  signUpWithPassword: asyncSignUp,
  signInWithGoogle: asyncNoop,
  resetPassword: asyncNoop,
  signOut: asyncNoop,
  enterGuestMode: noop,
  exitGuestMode: noop,
};

function Wrap({ children }: { readonly children: ReactNode }) {
  return (
    <AuthContext.Provider value={LOADING_AUTH}>
      <MemoryRouter initialEntries={['/auth/callback']}>{children}</MemoryRouter>
    </AuthContext.Provider>
  );
}

const meta: Meta<typeof AuthCallbackPage> = {
  title: 'L4/AuthCallbackPage',
  component: AuthCallbackPage,
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
type Story = StoryObj<typeof AuthCallbackPage>;

export const Default: Story = {
  name: 'Loading (waiting for Supabase session)',
};
