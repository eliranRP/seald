import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { envelopeKeys } from '@/features/envelopes';
import { CONTACTS_KEY } from '@/features/contacts';
import { AuthContext } from '@/providers/AuthProvider';
import type { AuthContextValue } from '@/providers/AuthProvider';
import { AppStateProvider } from '@/providers/AppStateProvider';
import { GDRIVE_ACCOUNTS_KEY } from '@/routes/settings/integrations/useGDriveAccounts';
import { MobileSendPage } from './MobileSendPage';

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
  qc.setQueryData(envelopeKeys.list({ limit: 3 }), { items: [], next_cursor: null });
  qc.setQueryData(GDRIVE_ACCOUNTS_KEY, []);
  qc.setQueryData(CONTACTS_KEY, []);
  return (
    <AuthContext.Provider value={STORY_AUTH}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/m/send']}>
          <AppStateProvider>
            <Routes>
              <Route path="/m/send" element={children} />
            </Routes>
          </AppStateProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}

const meta: Meta<typeof MobileSendPage> = {
  title: 'L4/MobileSendPage',
  component: MobileSendPage,
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
type Story = StoryObj<typeof MobileSendPage>;

/** Live `/m/send` start step at the 390px mobile viewport. */
export const Mobile: Story = {
  parameters: { chromatic: { modes: { mobile: chromaticViewportModes.mobile } } },
};

/** Same page at the 1440px desktop viewport. */
export const Desktop: Story = {
  parameters: { chromatic: { modes: { desktop: chromaticViewportModes.desktop } } },
};
