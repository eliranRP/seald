import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext } from '@/providers/AuthProvider';
import type { AuthContextValue } from '@/providers/AuthProvider';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { AuthPage } from './AuthPage';

async function asyncNoop(): Promise<void> {
  return Promise.resolve();
}
function noop(): void {
  /* storybook stub */
}

const STORY_AUTH: AuthContextValue = {
  session: null,
  user: null,
  guest: false,
  loading: false,
  signInWithGoogle: asyncNoop,
  signInWithEmailLink: asyncNoop,
  completeProfile: asyncNoop,
  signOut: asyncNoop,
  enterGuestMode: asyncNoop,
  exitGuestMode: noop,
};

function Wrap({ children, initial }: { readonly children: ReactNode; readonly initial: string }) {
  return (
    <AuthContext.Provider value={STORY_AUTH}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/signin" element={children} />
          <Route path="/signup" element={children} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

const meta: Meta<typeof AuthPage> = {
  title: 'L4/AuthPage',
  component: AuthPage,
  tags: ['autodocs', 'layer-4'],
  parameters: {
    layout: 'fullscreen',
    chromatic: { modes: chromaticViewportModes },
  },
};
export default meta;
type Story = StoryObj<typeof AuthPage>;

export const Start: Story = {
  render: () => (
    <Wrap initial="/signin">
      <AuthPage />
    </Wrap>
  ),
};

export const FromSignerDonePage: Story = {
  render: () => (
    <Wrap initial="/signup?email=hannah%40quill.vc">
      <AuthPage />
    </Wrap>
  ),
};

export const LinkExpired: Story = {
  render: () => (
    <Wrap initial="/signin?error=link_expired">
      <AuthPage />
    </Wrap>
  ),
};

export const GoogleError: Story = {
  render: () => (
    <Wrap initial="/signin?error=oauth">
      <AuthPage />
    </Wrap>
  ),
};
