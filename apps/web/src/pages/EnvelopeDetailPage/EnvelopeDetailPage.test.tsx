import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, type RenderResult } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactElement, ReactNode } from 'react';
import { ThemeProvider } from 'styled-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { seald } from '../../styles/theme';

vi.mock('../../lib/api/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// eslint-disable-next-line import/first
import { apiClient } from '../../lib/api/apiClient';
// eslint-disable-next-line import/first
import { EnvelopeDetailPage } from './EnvelopeDetailPage';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;

function renderAt(id: string): RenderResult {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <ThemeProvider theme={seald}>
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={[`/document/${id}`]}>
            <Routes>
              <Route path="/document/:id" element={children as ReactElement} />
              <Route path="/documents" element={<div>BACK</div>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </ThemeProvider>
    );
  }
  return render(<EnvelopeDetailPage />, { wrapper: Wrapper });
}

beforeEach(() => {
  get.mockReset();
});

describe('EnvelopeDetailPage', () => {
  it('renders envelope title, short code, and signer list on success', async () => {
    get.mockResolvedValueOnce({
      data: {
        id: 'env-1',
        owner_id: 'u',
        title: 'Master Services Agreement',
        short_code: 'MSA-ABCD-1234',
        status: 'awaiting_others',
        original_pages: 4,
        expires_at: '2030-01-01T00:00:00Z',
        tc_version: '1',
        privacy_version: '1',
        sent_at: '2026-04-01T00:00:00Z',
        completed_at: null,
        signers: [
          {
            id: 's1',
            email: 'maya@example.com',
            name: 'Maya Raskin',
            color: '#10B981',
            role: 'signatory',
            signing_order: 1,
            status: 'awaiting',
            viewed_at: null,
            tc_accepted_at: null,
            signed_at: null,
            declined_at: null,
          },
        ],
        fields: [],
        created_at: '2026-04-01T00:00:00Z',
        updated_at: '2026-04-01T00:00:00Z',
      },
      status: 200,
    });

    renderAt('env-1');

    expect(await screen.findByText(/master services agreement/i)).toBeInTheDocument();
    expect(screen.getByText('MSA-ABCD-1234')).toBeInTheDocument();
    expect(screen.getByText(/maya raskin/i)).toBeInTheDocument();
    expect(screen.getByText(/maya@example\.com/i)).toBeInTheDocument();
  });

  it('renders the not-found card when the server returns an error', async () => {
    get.mockRejectedValueOnce(Object.assign(new Error('envelope_not_found'), { status: 404 }));
    renderAt('env-missing');
    expect(
      await screen.findByRole('heading', { level: 1, name: /document not found/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to documents/i })).toBeInTheDocument();
  });

  it('shows skeleton placeholders while the query is pending', () => {
    // Never resolves.
    get.mockImplementationOnce(() => new Promise(() => {}));
    const { container } = renderAt('env-pending');
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});
