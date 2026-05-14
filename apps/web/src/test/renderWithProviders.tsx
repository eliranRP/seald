import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthContext } from '../providers/AuthProvider';
import type { AuthContextValue, AuthUser } from '../providers/AuthProvider';
import { AppStateProvider } from '../providers/AppStateProvider';
import { seald } from '../styles/theme';

const DEFAULT_USER: AuthUser = {
  id: 'test-user',
  email: 'jamie@seald.app',
  name: 'Jamie Okonkwo',
};

async function asyncNoop(): Promise<void> {
  return Promise.resolve();
}
async function asyncSignUp(): Promise<{ readonly needsEmailConfirmation: boolean }> {
  return { needsEmailConfirmation: false };
}
function noop(): void {
  /* test stub */
}

function buildContext(override: Partial<AuthContextValue>): AuthContextValue {
  return {
    session: null,
    user: DEFAULT_USER,
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
    ...override,
  };
}

function buildQueryClient(): QueryClient {
  // Disable retries + caching across tests so a stubbed `apiClient` can drive
  // each case without leaking state between renders.
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

export interface RenderProvidersOptions extends RenderOptions {
  /** Override individual auth-context fields. Defaults to an authed user. */
  readonly auth?: Partial<AuthContextValue>;
}

/**
 * Renders a UI under `ThemeProvider` + `QueryClientProvider` (fresh per
 * test) + stubbed `AuthContext` + real `AppStateProvider`. Used by
 * page-level tests that want the full plumbing without standing up Supabase
 * or a real network. Callers mock `../lib/api/apiClient` to control the
 * responses React-Query sees.
 */
export function renderWithProviders(
  ui: ReactElement,
  options: RenderProvidersOptions = {},
): RenderResult {
  const { auth, ...rest } = options;
  const value = buildContext(auth ?? {});
  const qc = buildQueryClient();
  function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <ThemeProvider theme={seald}>
        <QueryClientProvider client={qc}>
          <AuthContext.Provider value={value}>
            <AppStateProvider>{children}</AppStateProvider>
          </AuthContext.Provider>
        </QueryClientProvider>
      </ThemeProvider>
    );
  }
  return render(ui, { wrapper: Wrapper, ...rest });
}
