import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import * as flagsModule from 'shared';
import { seald } from '../../styles/theme';

vi.mock('../../lib/api/verifyApiClient', () => ({
  verifyApiClient: { get: vi.fn() },
}));

import { verifyApiClient } from '../../lib/api/verifyApiClient';
import { VerifyPage } from './VerifyPage';
import type { VerifyResponse } from '../../features/verify';

const get = verifyApiClient.get as unknown as ReturnType<typeof vi.fn>;

const HASH = (c: string): string => c.repeat(64);

const PAYLOAD: VerifyResponse = {
  envelope: {
    id: '804a6c00-2ad9-4590-8c5e-000000000001',
    title: 'Closing package',
    short_code: 'u82ZmvdxwG3CU',
    status: 'completed',
    original_pages: 3,
    original_sha256: HASH('a'),
    sealed_sha256: HASH('c'),
    tc_version: '1',
    privacy_version: '1',
    sent_at: '2026-04-25T21:20:55Z',
    completed_at: '2026-04-25T21:21:08Z',
    expires_at: '2030-01-01T00:00:00Z',
  },
  signers: [
    {
      id: 's1',
      name: 'Maya Johansson',
      email: 'maya@example.com',
      role: 'signer',
      status: 'completed',
      signed_at: '2026-04-25T21:21:05Z',
      declined_at: null,
    },
  ],
  events: [],
  chain_intact: true,
  sealed_url: 'https://signed.example/sealed.pdf',
  audit_url: 'https://signed.example/audit.pdf',
  documents: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      ord: 1,
      title: 'Master agreement',
      original_pages: 3,
      original_sha256: HASH('a'),
      sealed_sha256: HASH('c'),
      sealed_url: 'https://signed.example/doc-1-sealed.pdf',
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      ord: 2,
      title: 'Side letter',
      original_pages: 1,
      original_sha256: HASH('b'),
      sealed_sha256: HASH('d'),
      sealed_url: 'https://signed.example/doc-2-sealed.pdf',
    },
  ],
};

function renderVerify() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <ThemeProvider theme={seald}>
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={['/verify/u82ZmvdxwG3CU']}>
            <Routes>
              <Route path="/verify/:shortCode" element={children as React.ReactElement} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </ThemeProvider>
    );
  }
  return render(<VerifyPage />, { wrapper: Wrapper });
}

function setFlag(on: boolean): void {
  vi.spyOn(flagsModule, 'isFeatureEnabled').mockImplementation(
    (flag: string) => on && flag === 'multiDocumentEnvelopes',
  );
}

beforeEach(() => {
  get.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('VerifyPage with several documents', () => {
  it('lists each document with its own hashes and sealed download', async () => {
    setFlag(true);
    get.mockResolvedValueOnce({ data: PAYLOAD });
    renderVerify();

    expect(await screen.findByText(/Master agreement/)).toBeInTheDocument();
    expect(screen.getByText(/Side letter/)).toBeInTheDocument();
    expect(screen.getByLabelText('Original SHA-256 hash of Master agreement')).toHaveTextContent(
      HASH('a'),
    );
    expect(screen.getByLabelText('Sealed SHA-256 hash of Master agreement')).toHaveTextContent(
      HASH('c'),
    );
    expect(screen.getByLabelText('Original SHA-256 hash of Side letter')).toHaveTextContent(
      HASH('b'),
    );
    expect(screen.getByLabelText('Sealed SHA-256 hash of Side letter')).toHaveTextContent(
      HASH('d'),
    );

    expect(screen.getByRole('link', { name: 'Download sealed Master agreement' })).toHaveAttribute(
      'href',
      'https://signed.example/doc-1-sealed.pdf',
    );
    expect(screen.getByRole('link', { name: 'Download sealed Side letter' })).toHaveAttribute(
      'href',
      'https://signed.example/doc-2-sealed.pdf',
    );
    // The single envelope-level hash rows and download are replaced by the per-document ones.
    expect(screen.queryByLabelText('Original SHA-256 hash')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Sealed SHA-256 hash')).not.toBeInTheDocument();
    // The audit PDF stays.
    expect(screen.getByRole('link', { name: /audit pdf/i })).toBeInTheDocument();
  });

  it('renders the single-document view when the flag is off, even if documents arrive', async () => {
    setFlag(false);
    get.mockResolvedValueOnce({ data: PAYLOAD });
    renderVerify();

    expect(await screen.findByLabelText('Original SHA-256 hash')).toHaveTextContent(HASH('a'));
    expect(screen.getByLabelText('Sealed SHA-256 hash')).toHaveTextContent(HASH('c'));
    expect(screen.queryByLabelText(/SHA-256 hash of/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^download$/i })).toHaveAttribute(
      'href',
      'https://signed.example/sealed.pdf',
    );
  });

  it('keeps the single-document view for an envelope with one document', async () => {
    setFlag(true);
    get.mockResolvedValueOnce({
      data: { ...PAYLOAD, documents: [PAYLOAD.documents![0]!] },
    });
    renderVerify();
    expect(await screen.findByLabelText('Original SHA-256 hash')).toBeInTheDocument();
    expect(screen.queryByLabelText(/SHA-256 hash of/)).not.toBeInTheDocument();
  });
});
