import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext } from '../../providers/AuthProvider';
import type { AuthContextValue } from '../../providers/AuthProvider';
import { CheckEmailPage } from './CheckEmailPage';

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
  resendSignUpConfirmation: asyncNoop,
  signOut: asyncNoop,
  enterGuestMode: asyncNoop,
  exitGuestMode: noop,
};

function Wrap({ children, initial }: { readonly children: ReactNode; readonly initial: string }) {
  return (
    <AuthContext.Provider value={STORY_AUTH}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/check-email" element={children} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

const meta: Meta<typeof CheckEmailPage> = {
  title: 'L4/CheckEmailPage',
  component: CheckEmailPage,
  tags: ['autodocs', 'layer-4'],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof CheckEmailPage>;

export const ResetMode: Story = {
  name: 'Reset password mode',
  render: () => (
    <Wrap initial="/check-email?email=jamie%40seald.app&mode=reset">
      <CheckEmailPage />
    </Wrap>
  ),
};

export const SignupMode: Story = {
  name: 'Signup confirmation mode',
  render: () => (
    <Wrap initial="/check-email?email=jamie%40seald.app&mode=signup">
      <CheckEmailPage />
    </Wrap>
  ),
};
