import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthContext } from '../../providers/AuthProvider';
import type { AuthContextValue } from '../../providers/AuthProvider';
import { AppStateProvider } from '../../providers/AppStateProvider';
import { SAMPLE_TEMPLATES as TEMPLATES } from '../../test/templateFixtures';
import { TemplatesListPage } from './TemplatesListPage';

// Tagged variant of the seed so the Default story exercises the tag
// pills + filter menu surface. Untouched fixtures stay tag-less.
const TAGGED = TEMPLATES.map((t, i) => ({
  ...t,
  tags:
    i === 0
      ? ['Construction', 'Legal']
      : i === 1
        ? ['Legal', 'Sales']
        : i === 2
          ? ['HR', 'Legal']
          : ['Marketing'],
}));

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
        <MemoryRouter initialEntries={['/templates']}>
          <AppStateProvider>
            <Routes>
              <Route path="/templates" element={children} />
            </Routes>
          </AppStateProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}

const meta: Meta<typeof TemplatesListPage> = {
  title: 'L4/TemplatesListPage',
  component: TemplatesListPage,
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
type Story = StoryObj<typeof TemplatesListPage>;

export const Default: Story = {
  name: 'Initial render with seed templates (tagged)',
  args: { initialTemplates: TAGGED },
};

export const Empty: Story = {
  name: 'No templates yet',
  args: { initialTemplates: [] },
};
