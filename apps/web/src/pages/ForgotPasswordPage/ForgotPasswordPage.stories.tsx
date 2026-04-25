import type { Meta, StoryObj } from '@storybook/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext } from '../../providers/AuthProvider';
import type { AuthContextValue } from '../../providers/AuthProvider';
import { ForgotPasswordPage } from './ForgotPasswordPage';

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
  user: null,
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
  return (
    <AuthContext.Provider value={STORY_AUTH}>
      <MemoryRouter initialEntries={['/forgot-password']}>
        <Routes>
          <Route path="/forgot-password" element={children} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

const meta: Meta<typeof ForgotPasswordPage> = {
  title: 'L4/ForgotPasswordPage',
  component: ForgotPasswordPage,
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
type Story = StoryObj<typeof ForgotPasswordPage>;

export const Default: Story = {
  name: 'Reset password form',
};
