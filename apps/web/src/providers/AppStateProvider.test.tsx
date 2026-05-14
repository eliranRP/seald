import { describe, it, expect, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthContext, type AuthContextValue } from './AuthProvider';
import { AppStateProvider, useAppState } from './AppStateProvider';
import { seald } from '../styles/theme';

// The contacts hooks fan out to the apiClient — stub them so the provider
// boots without trying to fetch in the test environment.
vi.mock('../features/contacts', () => ({
  useContactsQuery: () => ({ data: [], isPending: false }),
  useCreateContactMutation: () => ({ mutateAsync: vi.fn() }),
  useUpdateContactMutation: () => ({ mutateAsync: vi.fn() }),
  useDeleteContactMutation: () => ({ mutateAsync: vi.fn() }),
}));

const guestAuth: AuthContextValue = {
  session: null,
  user: null,
  guest: true,
  loading: false,
  signInWithPassword: async () => {},
  signUpWithPassword: async () => ({ needsEmailConfirmation: false }),
  signInWithGoogle: async () => {},
  resetPassword: async () => {},
  resendSignUpConfirmation: async () => {},
  signOut: async () => {},
  enterGuestMode: async () => {},
  exitGuestMode: () => {},
};

function wrapper({ children }: { readonly children: ReactNode }): ReactElement {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <ThemeProvider theme={seald}>
      <QueryClientProvider client={qc}>
        <AuthContext.Provider value={guestAuth}>
          <AppStateProvider>{children}</AppStateProvider>
        </AuthContext.Provider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function newPdf(name: string): File {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], name, { type: 'application/pdf' });
}

describe('AppStateProvider', () => {
  it('createDocument returns a local id resolvable by getDocument', () => {
    const { result } = renderHook(() => useAppState(), { wrapper });
    let id = '';
    act(() => {
      id = result.current.createDocument(newPdf('a.pdf'), 1);
    });
    expect(id).toMatch(/^d_/);
    const doc = result.current.getDocument(id);
    expect(doc?.title).toBe('a');
    expect(doc?.envelopeId).toBeUndefined();
  });

  it('sendDocument(id, envelopeId) persists envelopeId and getDocument(envelopeId) resolves the same draft', () => {
    // This is the assertion that fails on pre-fix code: post-send the
    // SPA navigates to `/document/<envelope-uuid>/sent` and tries to
    // resolve the local draft via `getDocument(envelope-uuid)` — which
    // returned `undefined` before the fix because lookup was strictly
    // by local id (`d_xxx`). The result was the SentConfirmationPage's
    // "Document not found" fallback for guest senders, exactly the
    // user-reported "screen jumps back to fields" symptom.
    const { result } = renderHook(() => useAppState(), { wrapper });
    let localId = '';
    act(() => {
      localId = result.current.createDocument(newPdf('contract.pdf'), 1);
    });

    const envelopeId = 'env-uuid-7c1b';
    act(() => {
      result.current.sendDocument(localId, envelopeId);
    });

    // Both ids must resolve to the same in-memory draft.
    const byLocal = result.current.getDocument(localId);
    const byEnvelope = result.current.getDocument(envelopeId);
    expect(byLocal).toBeDefined();
    expect(byEnvelope).toBeDefined();
    expect(byEnvelope?.id).toBe(localId);
    expect(byEnvelope?.envelopeId).toBe(envelopeId);
    expect(byEnvelope?.status).toBe('awaiting-others');
  });

  it('sendDocument without envelopeId leaves the field undefined (back-compat)', () => {
    const { result } = renderHook(() => useAppState(), { wrapper });
    let localId = '';
    act(() => {
      localId = result.current.createDocument(newPdf('b.pdf'), 1);
    });
    act(() => {
      result.current.sendDocument(localId);
    });
    const doc = result.current.getDocument(localId);
    expect(doc?.envelopeId).toBeUndefined();
    expect(doc?.status).toBe('awaiting-others');
  });
});
