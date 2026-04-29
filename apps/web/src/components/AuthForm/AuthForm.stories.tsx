import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { AuthForm } from './AuthForm';
import { AuthShell } from '../AuthShell';
import { AuthContext } from '../../providers/AuthProvider';
import type { AuthContextValue } from '../../providers/AuthProvider';

function noop(): void {
  /* story stub */
}
async function asyncNoop(): Promise<void> {
  return Promise.resolve();
}
async function asyncSignUp(): Promise<{ readonly needsEmailConfirmation: boolean }> {
  return { needsEmailConfirmation: false };
}

const fakeAuth: AuthContextValue = {
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

function MockAuth({ children }: { readonly children: ReactNode }) {
  return <AuthContext.Provider value={fakeAuth}>{children}</AuthContext.Provider>;
}

const meta: Meta<typeof AuthForm> = {
  title: 'L3/AuthForm',
  component: AuthForm,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof AuthForm>;

export const SignIn: Story = {
  render: () => (
    <MockAuth>
      <AuthShell>
        <AuthForm mode="signin" onSkip={noop} onForgotPassword={noop} />
      </AuthShell>
    </MockAuth>
  ),
};

export const SignUp: Story = {
  render: () => (
    <MockAuth>
      <AuthShell>
        <AuthForm mode="signup" onSkip={noop} />
      </AuthShell>
    </MockAuth>
  ),
};

export const Forgot: Story = {
  render: () => (
    <MockAuth>
      <AuthShell>
        <AuthForm mode="forgot" />
      </AuthShell>
    </MockAuth>
  ),
};
