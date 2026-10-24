import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, within, type RenderResult } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactElement, ReactNode } from 'react';
import { ThemeProvider } from 'styled-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { seald } from '../../styles/theme';

vi.mock('../../lib/api/apiClient', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/features/gdriveExport', () => ({
  useSaveEnvelopeToGdrive: () => ({ inFlight: false, save: vi.fn() }),
}));

vi.mock('@/lib/pdf', () => ({
  usePdfDocument: () => ({ doc: null, numPages: 0, loading: false, error: null }),
}));

import { apiClient } from '../../lib/api/apiClient';
import { EnvelopeDetailPage } from './EnvelopeDetailPage';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;

interface OverrideHost {
  __SEALD_FEATURE_OVERRIDES__?: Record<string, boolean>;
}
const host = globalThis as OverrideHost;

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
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </ThemeProvider>
    );
  }
  return render(<EnvelopeDetailPage />, { wrapper: Wrapper });
}

const SIGNER = {
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
};

function mockEnvelope(status: string): void {
  get.mockImplementation((url: string) => {
    if (url.endsWith('/events')) return Promise.resolve({ data: { events: [] }, status: 200 });
    if (url.endsWith('/download')) {
      return Promise.resolve({ data: { url: '', kind: 'original' }, status: 200 });
    }
    return Promise.resolve({
      data: {
        id: 'env-1',
        owner_id: 'u',
        title: 'Master Services Agreement',
        short_code: 'MSA-ABCD-1234',
        status,
        original_pages: 2,
        expires_at: '2030-01-01T00:00:00Z',
        tc_version: '1',
        privacy_version: '1',
        sent_at: null,
        completed_at: null,
        signers: [SIGNER],
        fields: [
          {
            id: 'f1',
            signer_id: 's1',
            kind: 'signature',
            page: 1,
            x: 0.1,
            y: 0.8,
            width: 0.3,
            height: 0.07,
            required: true,
          },
        ],
        created_at: '2026-04-01T00:00:00Z',
        updated_at: '2026-04-01T00:00:00Z',
      },
      status: 200,
    });
  });
}

describe('EnvelopeDetailPage: Review placement (MCP "Later")', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    host.__SEALD_FEATURE_OVERRIDES__ = { mcpServer: true };
  });

  afterEach(() => {
    delete host.__SEALD_FEATURE_OVERRIDES__;
  });

  it('a draft shows Review placement; Send in the review sends it and says so', async () => {
    const user = userEvent.setup();
    mockEnvelope('draft');
    post.mockResolvedValue({ data: { id: 'env-1', status: 'awaiting_others', signers: [SIGNER] } });
    renderAt('env-1');

    await user.click(await screen.findByRole('button', { name: 'Review placement' }));
    const dialog = screen.getByRole('dialog', { name: 'Review placement' });
    await user.click(within(dialog).getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Sent for signature.')).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]?.[0]).toBe('/envelopes/env-1/send');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('an envelope that is already out has no Review placement', async () => {
    mockEnvelope('awaiting_others');
    renderAt('env-1');

    expect(await screen.findByRole('button', { name: 'More' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review placement' })).not.toBeInTheDocument();
  });

  it('with the MCP server flag off the page is unchanged', async () => {
    host.__SEALD_FEATURE_OVERRIDES__ = { mcpServer: false };
    mockEnvelope('draft');
    renderAt('env-1');

    expect(await screen.findByRole('button', { name: 'More' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review placement' })).not.toBeInTheDocument();
  });
});
