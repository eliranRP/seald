import type { ReactElement } from 'react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as flagsModule from 'shared';
import { AuthContext, type AuthContextValue } from '../providers/AuthProvider';
import { AppStateProvider, useAppState } from '../providers/AppStateProvider';
import { seald } from '../styles/theme';
import type { DraftDocumentPart } from '../features/documentEditor/documents';
import type { PlacedFieldValue } from '../components/PlacedField/PlacedField.types';

vi.mock('../lib/pdf', () => ({
  usePdfDocument: () => ({ doc: null, numPages: 0, loading: false, error: null }),
  readPdfInfo: async () => ({ pages: 1, aspect: 1.4 }),
}));

vi.mock('../lib/api/apiClient', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import { apiClient } from '../lib/api/apiClient';
import { DocumentRoute } from './DocumentRoute';

const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const put = apiClient.put as unknown as ReturnType<typeof vi.fn>;

const SIGNER_ID = '99999999-9999-4999-8999-999999999999';
const SERVER_ENVELOPE = 'env-server-1';
const SERVER_DOC_1 = 'server-doc-1';
const SERVER_DOC_2 = 'server-doc-2';

function buildAuth(): AuthContextValue {
  return {
    session: null,
    user: { id: 'u', email: 'jamie@seald.app', name: 'Jamie' },
    guest: false,
    loading: false,
    signInWithEmailLink: () => Promise.resolve(),
    completeProfile: () => Promise.resolve(),
    signInWithGoogle: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
    enterGuestMode: () => Promise.resolve(),
    exitGuestMode: () => undefined,
  };
}

function pdf(name: string): File {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], name, { type: 'application/pdf' });
}

const PART_A: DraftDocumentPart = {
  id: 'part-a',
  title: 'Master agreement',
  file: pdf('master.pdf'),
  totalPages: 3,
  aspect: 1.4,
};
const PART_B: DraftDocumentPart = {
  id: 'part-b',
  title: 'Side letter',
  file: pdf('side.pdf'),
  totalPages: 1,
  aspect: 1.0,
};

function sig(id: string, documentId: string, y: number): PlacedFieldValue {
  return { id, page: 1, type: 'signature', x: 100, y, signerIds: [SIGNER_ID], documentId };
}

/** Seeds one draft: two documents, one signature on each. */
function DraftSeeder() {
  const { createDocument, updateDocument } = useAppState();
  useEffect(() => {
    const id = createDocument(PART_A.file, PART_A.totalPages);
    updateDocument(id, {
      documents: [PART_A, PART_B],
      fields: [sig('f-a', 'part-a', 140), sig('f-b', 'part-b', 280)],
      signers: [{ id: SIGNER_ID, name: 'Maya', email: 'maya@example.com', color: '#10B981' }],
    });
  }, [createDocument, updateDocument]);
  return null;
}

function setFlags(multi: boolean): void {
  vi.spyOn(flagsModule, 'isFeatureEnabled').mockImplementation(
    (flag: string) => multi && flag === 'multiDocumentEnvelopes',
  );
}

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  // Contacts query (AppStateProvider) resolves empty.
  get.mockResolvedValue({ data: [], status: 200 });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

/**
 * The route resolves its draft from the URL, so these tests render a small
 * host that seeds the draft first and then mounts the route at its id.
 */
function SeededRoute(): ReactElement {
  const { documents } = useAppState();
  const draft = documents[0];
  if (!draft) return <DraftSeeder />;
  return (
    <MemoryRouter initialEntries={[`/document/${draft.id}`]}>
      <Routes>
        <Route path="/document/:id" element={<DocumentRoute />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderSeeded(): RenderResult {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider theme={seald}>
      <QueryClientProvider client={qc}>
        <AuthContext.Provider value={buildAuth()}>
          <AppStateProvider>
            <SeededRoute />
          </AppStateProvider>
        </AuthContext.Provider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('DocumentRoute multi-document editor', () => {
  it('shows the document switcher and list, and switches the document on screen', async () => {
    setFlags(true);
    renderSeeded();

    const switcher = await screen.findByRole('navigation', { name: 'Switch document' });
    const tabs = within(switcher).getAllByRole('button');
    expect(tabs).toHaveLength(2);
    // The second document is not the one on screen until picked: the first is.
    expect(tabs[0]).toHaveAttribute('aria-current', 'true');

    const list = screen.getByRole('region', { name: 'Documents' });
    expect(
      within(list).getByRole('button', { name: /side letter, document 2 of 2/i }),
    ).toBeInTheDocument();

    await userEvent.click(within(switcher).getByRole('button', { name: /2\. side letter/i }));
    // The editor remounts per document, so look the strips up again.
    const switcherAfter = await screen.findByRole('navigation', { name: 'Switch document' });
    expect(within(switcherAfter).getByRole('button', { name: /2\. side letter/i })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(
      within(screen.getByRole('region', { name: 'Documents' })).getByRole('button', {
        name: /side letter, document 2 of 2/i,
      }),
    ).toHaveAttribute('aria-current', 'true');
  });

  it('reorders documents with the Move buttons', async () => {
    setFlags(true);
    renderSeeded();
    const list = await screen.findByRole('region', { name: 'Documents' });
    await userEvent.click(within(list).getByRole('button', { name: 'Move Side letter up' }));
    const rows = within(list).getAllByRole('listitem');
    expect(within(rows[0]!).getByText('Side letter')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Master agreement')).toBeInTheDocument();
  });

  it('asks before removing a document that has fields, then removes it', async () => {
    setFlags(true);
    renderSeeded();
    const list = await screen.findByRole('region', { name: 'Documents' });
    await userEvent.click(within(list).getByRole('button', { name: 'Remove Side letter' }));
    const dialog = await screen.findByRole('alertdialog', { name: /remove this document/i });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove document' }));
    await waitFor(() => {
      expect(screen.queryByRole('navigation', { name: 'Switch document' })).not.toBeInTheDocument();
    });
    // Back to a single PDF: one row, nothing left to remove.
    expect(
      within(screen.getByRole('region', { name: 'Documents' })).getAllByRole('listitem'),
    ).toHaveLength(1);
  });

  it('sends every document in order and places each field on its own document', async () => {
    setFlags(true);
    post.mockImplementation(async (url: string, body: unknown) => {
      if (url === '/envelopes') return { data: { id: SERVER_ENVELOPE } };
      if (url === `/envelopes/${SERVER_ENVELOPE}/documents`) {
        const title = (body as FormData).get('title');
        return { data: { id: title === 'Master agreement' ? SERVER_DOC_1 : SERVER_DOC_2 } };
      }
      if (url === `/envelopes/${SERVER_ENVELOPE}/signers`) return { data: { id: 'server-signer' } };
      if (url === `/envelopes/${SERVER_ENVELOPE}/send`) {
        return { data: { id: SERVER_ENVELOPE, short_code: 'abc' } };
      }
      return { data: {} };
    });
    put.mockResolvedValue({ data: [] });
    // After the send the route shows the envelope's detail page for the new id.
    // Without a real envelope body that page throws if it renders before the
    // test unmounts, which happens on a slow machine.
    get.mockImplementation(async (url: string) => {
      if (url === `/envelopes/${SERVER_ENVELOPE}`) {
        return {
          data: {
            id: SERVER_ENVELOPE,
            title: 'Master agreement',
            short_code: 'abc',
            status: 'awaiting_others',
            delivery_mode: 'parallel',
            signers: [],
            fields: [],
            tags: [],
            expires_at: '2099-12-31T00:00:00.000Z',
          },
          status: 200,
        };
      }
      if (url === `/envelopes/${SERVER_ENVELOPE}/events`) {
        return { data: { events: [] }, status: 200 };
      }
      return { data: [], status: 200 };
    });
    renderSeeded();

    await userEvent.click(await screen.findByRole('button', { name: /^send$/i }));

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        `/envelopes/${SERVER_ENVELOPE}/send`,
        expect.anything(),
        expect.anything(),
      );
    });

    // Documents are added in the order the sender arranged, never via the legacy upload.
    const documentCalls = post.mock.calls.filter(
      (c) => c[0] === `/envelopes/${SERVER_ENVELOPE}/documents`,
    );
    expect(documentCalls.map((c) => (c[1] as FormData).get('title'))).toEqual([
      'Master agreement',
      'Side letter',
    ]);
    expect(post.mock.calls.some((c) => c[0] === `/envelopes/${SERVER_ENVELOPE}/upload`)).toBe(
      false,
    );

    // Each field carries the server id of its own document.
    expect(put).toHaveBeenCalledTimes(1);
    const placed = (
      put.mock.calls[0]![1] as { fields: ReadonlyArray<{ document_id?: string; y: number }> }
    ).fields;
    expect(placed.map((f) => f.document_id)).toEqual([SERVER_DOC_1, SERVER_DOC_2]);
    // Each document is normalised against its own page size: the 1.0-aspect
    // side letter puts y=280 at 0.5, the 1.4-aspect master puts y=140 at ~0.18.
    expect(placed[0]!.y).toBeCloseTo(140 / (560 * 1.4), 2);
    expect(placed[1]!.y).toBeCloseTo(280 / 560, 2);
  });
});
