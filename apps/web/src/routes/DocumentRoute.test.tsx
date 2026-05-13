import type { ReactElement, ReactNode } from 'react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, type RenderResult } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthContext, type AuthContextValue } from '../providers/AuthProvider';
import { AppStateProvider, useAppState } from '../providers/AppStateProvider';
import { seald } from '../styles/theme';

// pdfjs is impractical in jsdom — short-circuit the loader so the route
// doesn't drop into <PdfLoading> while the regression assertion is running.
vi.mock('../lib/pdf', () => ({
  usePdfDocument: () => ({ doc: null, numPages: 0, loading: false, error: null }),
}));

// Stub the apiClient so EnvelopeDetailPage's queries resolve without a network
// hop. Lets the regression test focus on which page renders for the route.
vi.mock('../lib/api/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// eslint-disable-next-line import/first
import { apiClient } from '../lib/api/apiClient';
// eslint-disable-next-line import/first
import { DocumentRoute } from './DocumentRoute';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;

function buildAuth(): AuthContextValue {
  return {
    session: null,
    user: { id: 'u', email: 'jamie@seald.app', name: 'Jamie' },
    guest: false,
    loading: false,
    signInWithPassword: () => Promise.resolve(),
    signUpWithPassword: () => Promise.resolve({ needsEmailConfirmation: false }),
    signInWithGoogle: () => Promise.resolve(),
    resetPassword: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
    enterGuestMode: () => Promise.resolve(),
    exitGuestMode: () => undefined,
  };
}

/**
 * Seeds the AppStateProvider with a sent local doc keyed by the given
 * envelopeId, then unmounts itself so it doesn't double-fire under StrictMode.
 */
function SentDocSeeder({ envelopeId }: { readonly envelopeId: string }) {
  const { createDocument, sendDocument } = useAppState();
  useEffect(() => {
    const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'Mellon-St.pdf', {
      type: 'application/pdf',
    });
    const localId = createDocument(file, 1);
    sendDocument(localId, envelopeId);
  }, [createDocument, sendDocument, envelopeId]);
  return null;
}

function renderRouteAt(envelopeId: string): RenderResult {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <ThemeProvider theme={seald}>
        <QueryClientProvider client={qc}>
          <AuthContext.Provider value={buildAuth()}>
            <AppStateProvider>
              <SentDocSeeder envelopeId={envelopeId} />
              {children}
            </AppStateProvider>
          </AuthContext.Provider>
        </QueryClientProvider>
      </ThemeProvider>
    );
  }
  return render(
    <MemoryRouter initialEntries={[`/document/${envelopeId}`]}>
      <Routes>
        <Route path="/document/:id" element={(<DocumentRoute />) as ReactElement} />
      </Routes>
    </MemoryRouter>,
    { wrapper: Wrapper },
  );
}

beforeEach(() => {
  get.mockReset();
  // EnvelopeDetailPage fires `GET /envelopes/:id` and `GET /envelopes/:id/events`.
  // Resolve both with the minimum shape so the page renders past its loading
  // state — the test only needs to confirm EnvelopeDetailPage rendered.
  get.mockImplementation((url: string) => {
    if (url.endsWith('/events')) {
      return Promise.resolve({ data: { events: [] }, status: 200 });
    }
    return Promise.resolve({
      data: {
        id: 'env-uuid-1',
        owner_id: 'u',
        title: 'Mellon St Pricing Sheet',
        short_code: 'yNNe6V2omMRvh',
        status: 'completed',
        original_pages: 2,
        expires_at: '2030-01-01T00:00:00Z',
        tc_version: '1',
        privacy_version: '1',
        sent_at: '2026-05-01T00:00:00Z',
        completed_at: '2026-05-02T00:00:00Z',
        signers: [
          {
            id: 's1',
            email: 'eliran@example.com',
            name: 'Eliran',
            color: '#7C3AED',
            role: 'signatory',
            signing_order: 1,
            status: 'signed',
            viewed_at: '2026-05-01T00:00:00Z',
            tc_accepted_at: '2026-05-01T00:00:00Z',
            signed_at: '2026-05-02T00:00:00Z',
            declined_at: null,
          },
        ],
        fields: [],
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-02T00:00:00Z',
      },
      status: 200,
    });
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('DocumentRoute', () => {
  it('regression: routes a sent (non-draft) local doc to EnvelopeDetailPage, NOT the editor', async () => {
    // Reproduces the seald.nromomentum.com issue (2026-05-02): after sending a
    // doc, the local AppStateProvider record persists with status
    // 'awaiting-others' and an envelopeId pointing at the server uuid.
    // PR #92 made `getDocument(envelopeId)` resolve that local record so the
    // post-send /sent screen could still find it — a useful behavior, but it
    // leaked into /document/:envelopeId, which started rendering the editor's
    // "Ready to send" rail for sealed envelopes because DocumentRoute only
    // fell back to <EnvelopeDetailPage /> when `doc` was undefined. This test
    // pins the desired behavior: a non-draft local doc visited at
    // /document/:envelopeId must render the detail/audit page, not the editor.
    const envelopeId = 'env-uuid-1';
    renderRouteAt(envelopeId);

    // EnvelopeDetailPage shows the envelope title from the API mock once
    // the query resolves. The title renders both in the breadcrumb's
    // trailing slot AND in the h1 heading, so prefer the level-1
    // heading role/name query to keep the assertion unambiguous (rule
    // 4.6). Editor would show 'Ready to send' (right-rail title in
    // DocumentPage.tsx:559) instead.
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /Mellon St Pricing Sheet/i }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/ready to send/i)).not.toBeInTheDocument();
  });
});
