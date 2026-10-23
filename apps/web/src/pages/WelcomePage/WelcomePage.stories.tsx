import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Session } from '@supabase/supabase-js';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext } from '@/providers/AuthProvider';
import type { AuthContextValue } from '@/providers/AuthProvider';
import { WelcomePage } from './WelcomePage';

async function asyncNoop(): Promise<void> {
  return Promise.resolve();
}
function noop(): void {
  /* storybook stub */
}

const NEW_ACCOUNT: Session = {
  access_token: 'story',
  user: {
    id: 'u1',
    is_anonymous: false,
    user_metadata: {},
    created_at: '2026-05-01T10:00:00Z',
  },
} as unknown as Session;

const STORY_AUTH: AuthContextValue = {
  session: NEW_ACCOUNT,
  user: { id: 'u1', email: 'hannah@quill.vc', name: 'hannah' },
  guest: false,
  loading: false,
  signInWithGoogle: asyncNoop,
  signInWithEmailLink: asyncNoop,
  completeProfile: asyncNoop,
  signOut: asyncNoop,
  enterGuestMode: asyncNoop,
  exitGuestMode: noop,
};

function Wrap({ children }: { readonly children: ReactNode }) {
  return (
    <AuthContext.Provider value={STORY_AUTH}>
      <MemoryRouter initialEntries={['/welcome']}>
        <Routes>
          <Route path="/welcome" element={children} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

const meta: Meta<typeof WelcomePage> = {
  title: 'L4/WelcomePage',
  component: WelcomePage,
  tags: ['autodocs', 'layer-4'],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof WelcomePage>;

export const NewUser: Story = {
  render: () => (
    <Wrap>
      <WelcomePage />
    </Wrap>
  ),
};
