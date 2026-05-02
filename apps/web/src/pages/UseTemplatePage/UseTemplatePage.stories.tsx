import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthContext } from '../../providers/AuthProvider';
import type { AuthContextValue } from '../../providers/AuthProvider';
import { AppStateProvider } from '../../providers/AppStateProvider';
import { setTemplates } from '../../features/templates';
import { SAMPLE_TEMPLATES as TEMPLATES } from '../../test/templateFixtures';
import { UseTemplatePage } from './UseTemplatePage';

// Stories need fixtures; production ships with an empty list. Seed once
// at module scope so every story sees the same fixtures via
// `findTemplateById`.
setTemplates(TEMPLATES);

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
  enterGuestMode: asyncNoop,
  exitGuestMode: noop,
};

function Wrap({
  children,
  initialPath,
}: {
  readonly children: ReactNode;
  readonly initialPath: string;
}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return (
    <AuthContext.Provider value={STORY_AUTH}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[initialPath]}>
          <AppStateProvider>
            <Routes>
              <Route path="/templates/:id/use" element={children} />
            </Routes>
          </AppStateProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}

const FIRST = TEMPLATES[0]!;

const meta: Meta<typeof UseTemplatePage> = {
  title: 'L4/UseTemplatePage',
  component: UseTemplatePage,
  tags: ['autodocs', 'layer-4'],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof UseTemplatePage>;

export const Default: Story = {
  name: 'Existing template (preview + apply)',
  decorators: [
    (Story) => (
      <Wrap initialPath={`/templates/${encodeURIComponent(FIRST.id)}/use`}>
        <Story />
      </Wrap>
    ),
  ],
};

export const NotFound: Story = {
  name: 'Unknown template id',
  decorators: [
    (Story) => (
      <Wrap initialPath="/templates/TPL-DOESNT-EXIST/use">
        <Story />
      </Wrap>
    ),
  ],
};
