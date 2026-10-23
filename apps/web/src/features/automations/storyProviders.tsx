import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AutomationRunOutput, OwnerAutomation } from 'shared';
import { AuthContext, type AuthContextValue } from '@/providers/AuthProvider';
import { AUTOMATIONS_KEY, detailKey, runsKey } from './automationsApi';

/**
 * Story wrapper: the screens read from the React Query cache, so seeding it
 * keeps every story off the network. Stories only.
 */
function noop(): void {
  /* story stub */
}
async function asyncNoop(): Promise<void> {
  return Promise.resolve();
}

const AUTH: AuthContextValue = {
  session: null,
  user: { id: 'story-user', email: 'jamie@example.com', name: 'Jamie Okonkwo' },
  guest: false,
  loading: false,
  signInWithPassword: asyncNoop,
  signUpWithPassword: () => Promise.resolve({ needsEmailConfirmation: false }),
  signInWithGoogle: asyncNoop,
  resetPassword: asyncNoop,
  resendSignUpConfirmation: asyncNoop,
  signOut: asyncNoop,
  enterGuestMode: asyncNoop,
  exitGuestMode: noop,
};

interface StorySeed {
  readonly list?: readonly OwnerAutomation[];
  readonly detail?: OwnerAutomation;
  readonly runs?: readonly AutomationRunOutput[];
}

export function StoryProviders({
  seed,
  initialPath = '/settings/automations',
  children,
}: {
  readonly seed: StorySeed;
  readonly initialPath?: string;
  readonly children: ReactNode;
}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  if (seed.list) qc.setQueryData(AUTOMATIONS_KEY, { items: seed.list, next_cursor: null });
  if (seed.detail) {
    qc.setQueryData(detailKey(seed.detail.id), seed.detail);
    qc.setQueryData(runsKey(seed.detail.id), {
      pages: [{ items: seed.runs ?? [], next_cursor: null }],
      pageParams: [undefined],
    });
  }
  return (
    <AuthContext.Provider value={AUTH}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[initialPath]}>
          <div style={{ padding: 16 }}>{children}</div>
        </MemoryRouter>
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}
