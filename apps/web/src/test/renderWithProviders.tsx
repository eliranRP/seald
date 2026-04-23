import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
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
    signOut: asyncNoop,
    enterGuestMode: noop,
    exitGuestMode: noop,
    ...override,
  };
}

export interface RenderProvidersOptions extends RenderOptions {
  /** Override individual auth-context fields. Defaults to an authed user. */
  readonly auth?: Partial<AuthContextValue>;
}

/**
 * Renders a UI under `ThemeProvider` + stubbed `AuthContext` + real
 * `AppStateProvider`. Used by page-level tests that want the full app state
 * plumbing without standing up Supabase.
 */
export function renderWithProviders(
  ui: ReactElement,
  options: RenderProvidersOptions = {},
): RenderResult {
  const { auth, ...rest } = options;
  const value = buildContext(auth ?? {});
  function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <ThemeProvider theme={seald}>
        <AuthContext.Provider value={value}>
          <AppStateProvider>{children}</AppStateProvider>
        </AuthContext.Provider>
      </ThemeProvider>
    );
  }
  return render(ui, { wrapper: Wrapper, ...rest });
}
