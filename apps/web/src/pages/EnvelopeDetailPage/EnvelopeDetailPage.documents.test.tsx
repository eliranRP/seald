import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactElement, ReactNode } from 'react';
import { ThemeProvider } from 'styled-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as flagsModule from 'shared';
import { seald } from '../../styles/theme';

vi.mock('../../lib/api/apiClient', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
vi.mock('@/features/gdriveExport', () => ({
  useSaveEnvelopeToGdrive: () => ({ inFlight: false, save: vi.fn() }),
}));

import { apiClient } from '../../lib/api/apiClient';
import { EnvelopeDetailPage } from './EnvelopeDetailPage';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const put = apiClient.put as unknown as ReturnType<typeof vi.fn>;
const del = apiClient.delete as unknown as ReturnType<typeof vi.fn>;

const DOC_A = '11111111-1111-4111-8111-111111111111';
const DOC_B = '22222222-2222-4222-8222-222222222222';

function documents() {
  return [
    {
      id: DOC_A,
      ord: 1,
      title: 'Master agreement',
      original_pages: 3,
      original_sha256: 'a'.repeat(64),
      sealed_sha256: 'c'.repeat(64),
    },
    {
      id: DOC_B,
      ord: 2,
      title: 'Side letter',
      original_pages: 1,
      original_sha256: 'b'.repeat(64),
      sealed_sha256: 'd'.repeat(64),
    },
  ];
}

function mockEnvelope(status: string, docs = documents()): void {
  get.mockImplementation((url: string, config?: { params?: Record<string, string> }) => {
    if (url.endsWith('/events')) return Promise.resolve({ data: { events: [] }, status: 200 });
    if (url.endsWith('/download')) {
      const p = config?.params ?? {};
      return Promise.resolve({
        data: {
          url: `https://signed.example/${p.kind ?? 'x'}-${p.document_id ?? 'all'}.pdf`,
          kind: p.kind,
        },
        status: 200,
      });
    }
    return Promise.resolve({
      data: {
        id: 'env-1',
        owner_id: 'u',
        title: 'Closing package',
        short_code: 'MSA-ABCD-1234',
        status,
        original_pages: 3,
        expires_at: '2030-01-01T00:00:00Z',
        tc_version: '1',
        privacy_version: '1',
        sent_at: '2026-04-01T00:00:00Z',
        completed_at: status === 'completed' ? '2026-04-02T00:00:00Z' : null,
        signers: [],
        fields: [],
        documents: docs,
        created_at: '2026-04-01T00:00:00Z',
        updated_at: '2026-04-01T00:00:00Z',
      },
      status: 200,
    });
  });
}

function renderAt(id: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <ThemeProvider theme={seald}>
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={[`/document/${id}`]}>
            <Routes>
              <Route path="/document/:id" element={children as ReactElement} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </ThemeProvider>
    );
  }
  return render(<EnvelopeDetailPage />, { wrapper: Wrapper });
}

function setFlag(on: boolean): void {
  vi.spyOn(flagsModule, 'isFeatureEnabled').mockImplementation(
    (flag: string) => on && flag === 'multiDocumentEnvelopes',
  );
}

beforeEach(() => {
  get.mockReset();
  put.mockReset();
  del.mockReset();
  vi.spyOn(window, 'open').mockReturnValue(null);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('EnvelopeDetailPage with several documents', () => {
  it('lists each document with its hashes', async () => {
    setFlag(true);
    mockEnvelope('completed');
    renderAt('env-1');

    const card = await screen.findByRole('region', { name: 'Documents in this envelope' });
    expect(within(card).getAllByRole('listitem')).toHaveLength(2);
    expect(within(card).getByLabelText('Sealed SHA-256 of Master agreement')).toHaveTextContent(
      'c'.repeat(64),
    );
    expect(within(card).getByLabelText('Original SHA-256 of Side letter')).toHaveTextContent(
      'b'.repeat(64),
    );
  });

  it('downloads one document through ?document_id=', async () => {
    setFlag(true);
    mockEnvelope('completed');
    renderAt('env-1');
    const card = await screen.findByRole('region', { name: 'Documents in this envelope' });

    await userEvent.click(
      within(card).getByRole('button', { name: 'Download sealed Side letter' }),
    );

    await waitFor(() => {
      expect(get).toHaveBeenCalledWith(
        '/envelopes/env-1/download',
        expect.objectContaining({ params: { kind: 'sealed', document_id: DOC_B } }),
      );
    });
  });

  it('"Download all (zip)" asks for kind=zip', async () => {
    setFlag(true);
    mockEnvelope('completed');
    renderAt('env-1');
    const card = await screen.findByRole('region', { name: 'Documents in this envelope' });

    await userEvent.click(within(card).getByRole('button', { name: /download all \(zip\)/i }));

    await waitFor(() => {
      expect(get).toHaveBeenCalledWith(
        '/envelopes/env-1/download',
        expect.objectContaining({ params: { kind: 'zip' } }),
      );
    });
  });

  it('offers the zip in the download menu instead of the single-document rows', async () => {
    setFlag(true);
    mockEnvelope('completed');
    renderAt('env-1');
    await screen.findByRole('region', { name: 'Documents in this envelope' });

    await userEvent.click(screen.getByRole('button', { name: /show all download options/i }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('All documents (zip)')).toBeInTheDocument();
    expect(within(menu).queryByText('Original PDF')).not.toBeInTheDocument();
    expect(within(menu).queryByText('Full package')).not.toBeInTheDocument();
  });

  it('an unsealed draft offers original downloads and reorder / remove', async () => {
    setFlag(true);
    mockEnvelope('draft');
    put.mockResolvedValue({ data: { documents: [] } });
    del.mockResolvedValue({ data: undefined, status: 204 });
    renderAt('env-1');
    const card = await screen.findByRole('region', { name: 'Documents in this envelope' });

    expect(
      within(card).queryByRole('button', { name: /download all \(zip\)/i }),
    ).not.toBeInTheDocument();
    expect(
      within(card).getByRole('button', { name: 'Download original Master agreement' }),
    ).toBeInTheDocument();

    await userEvent.click(within(card).getByRole('button', { name: 'Move Side letter up' }));
    await waitFor(() => {
      expect(put).toHaveBeenCalledWith(
        '/envelopes/env-1/documents/order',
        { document_ids: [DOC_B, DOC_A] },
        expect.anything(),
      );
    });

    await userEvent.click(within(card).getByRole('button', { name: 'Remove Side letter' }));
    await waitFor(() => {
      expect(del).toHaveBeenCalledWith(`/envelopes/env-1/documents/${DOC_B}`, expect.anything());
    });
  });

  it('shows no documents card with the flag off, or for a single document', async () => {
    setFlag(false);
    mockEnvelope('completed');
    const { unmount } = renderAt('env-1');
    await screen.findByRole('heading', { level: 1, name: /closing package/i });
    expect(
      screen.queryByRole('region', { name: 'Documents in this envelope' }),
    ).not.toBeInTheDocument();
    unmount();

    setFlag(true);
    mockEnvelope('completed', documents().slice(0, 1));
    renderAt('env-1');
    await screen.findByRole('heading', { level: 1, name: /closing package/i });
    expect(
      screen.queryByRole('region', { name: 'Documents in this envelope' }),
    ).not.toBeInTheDocument();
  });
});
