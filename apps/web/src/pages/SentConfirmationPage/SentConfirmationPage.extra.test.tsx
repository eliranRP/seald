import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type * as RouterTypes from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';

// We mock react-router's `useNavigate` so the click-handler tests can
// observe navigation without spinning up a full route tree.
const navigateSpy = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof RouterTypes>('react-router-dom');
  return { ...actual, useNavigate: () => navigateSpy };
});

// Simulated API: returns specific shapes per envelope id, and a Promise
// that never resolves for the "loading" case so the pending skeleton
// renders.
vi.mock('../../lib/api/apiClient', () => ({
  apiClient: {
    get: vi.fn((url: string) => {
      if (url.startsWith('/envelopes/env-pending')) {
        // Hangs forever — exercises the `isPending` branch.
        return new Promise(() => {});
      }
      if (url.startsWith('/envelopes/env-missing')) {
        return Promise.reject(new Error('not found'));
      }
      if (url.startsWith('/envelopes/env-single')) {
        return Promise.resolve({
          status: 200,
          data: {
            id: 'env-single',
            owner_id: 'u',
            title: 'Single signer NDA',
            short_code: 'NDA-0001',
            status: 'awaiting_others',
            original_pages: 1,
            expires_at: '2030-01-01T00:00:00Z',
            tc_version: '1',
            privacy_version: '1',
            sent_at: '2026-04-01T00:00:00Z',
            completed_at: null,
            signers: [
              {
                id: 's1',
                email: 'noa@example.com',
                name: 'Noa Cohen',
                color: '#10B981',
                role: 'signatory',
                signing_order: 1,
                status: 'awaiting',
                signed_at: null,
                declined_at: null,
              },
            ],
          },
        });
      }
      if (url.startsWith('/envelopes/env-unicode')) {
        return Promise.resolve({
          status: 200,
          data: {
            id: 'env-unicode',
            owner_id: 'u',
            // Mixed RTL + emoji + accented latin to verify the heading and
            // signer rows render unicode without escaping.
            title: 'הסכם 🚀 Café',
            short_code: 'UNI-עברית',
            status: 'awaiting_others',
            original_pages: 1,
            expires_at: '2030-01-01T00:00:00Z',
            tc_version: '1',
            privacy_version: '1',
            sent_at: '2026-04-01T00:00:00Z',
            completed_at: null,
            signers: [
              {
                id: 'r1',
                email: 'rtl@example.com',
                name: 'אריאל 🦊',
                color: '#10B981',
                role: 'signatory',
                signing_order: 1,
                status: 'awaiting',
                signed_at: null,
                declined_at: null,
              },
              {
                id: 'r2',
                email: 'cafe@example.com',
                name: 'Café Owner',
                color: '#F59E0B',
                role: 'signatory',
                signing_order: 2,
                status: 'awaiting',
                signed_at: null,
                declined_at: null,
              },
            ],
          },
        });
      }
      return Promise.resolve({ status: 200, data: { items: [], next_cursor: null } });
    }),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// eslint-disable-next-line import/first
import { SentConfirmationPage } from './SentConfirmationPage';

function renderAt(envId: string) {
  navigateSpy.mockReset();
  return renderWithProviders(
    <MemoryRouter initialEntries={[`/sent/${envId}`]}>
      <Routes>
        <Route path="/sent/:id" element={<SentConfirmationPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SentConfirmationPage — pending state', () => {
  it('renders an aria-busy skeleton card while the API is in flight', async () => {
    const { container } = renderAt('env-pending');
    const card = container.querySelector('[aria-busy="true"]');
    expect(card).not.toBeNull();
    // No headline yet.
    expect(
      screen.queryByRole('heading', { level: 1, name: /sent\. your envelope is on its way/i }),
    ).not.toBeInTheDocument();
  });
});

describe('SentConfirmationPage — not-found fallback', () => {
  it('renders the recoverable "Document not found" card when the API rejects', async () => {
    renderAt('env-missing');
    expect(
      await screen.findByRole('heading', { level: 1, name: /document not found/i }),
    ).toBeInTheDocument();
    const cta = screen.getByRole('button', { name: /back to documents/i });
    fireEvent.click(cta);
    expect(navigateSpy).toHaveBeenCalledWith('/documents');
  });
});

describe('SentConfirmationPage — single signer copy', () => {
  it('uses the singular "Invitation delivered to" caption when there is exactly one signer', async () => {
    renderAt('env-single');
    expect(await screen.findByText(/invitation delivered to$/i)).toBeInTheDocument();
    // Plural form is NOT present.
    expect(screen.queryByText(/invitations delivered to \d+ signers/i)).not.toBeInTheDocument();
  });
});

describe('SentConfirmationPage — unicode + RTL', () => {
  it('renders RTL + emoji + accented latin characters verbatim in title and signer rows', async () => {
    renderAt('env-unicode');
    expect(
      await screen.findByRole('heading', { level: 1, name: /sent\. your envelope is on its way/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/הסכם 🚀 Café/)).toBeInTheDocument();
    expect(screen.getByText(/אריאל 🦊/)).toBeInTheDocument();
    // The short_code appears twice (DocCode + retention's verify path).
    expect(screen.getAllByText(/UNI-עברית/).length).toBeGreaterThanOrEqual(1);
    // 2 signers -> plural caption.
    expect(screen.getByText(/invitations delivered to 2 signers/i)).toBeInTheDocument();
  });

  it('uses the signers list with an accessible `Signers` label', async () => {
    renderAt('env-unicode');
    expect(await screen.findByRole('list', { name: /signers/i })).toBeInTheDocument();
  });
});

describe('SentConfirmationPage — primary action', () => {
  it('"View envelope" navigates to /document/:id', async () => {
    renderAt('env-single');
    const cta = await screen.findByRole('button', { name: /view envelope/i });
    fireEvent.click(cta);
    expect(navigateSpy).toHaveBeenCalledWith('/document/env-single');
  });

  it('"Back to documents" navigates to /documents', async () => {
    renderAt('env-single');
    const cta = await screen.findByRole('button', { name: /back to documents/i });
    fireEvent.click(cta);
    expect(navigateSpy).toHaveBeenCalledWith('/documents');
  });
});

describe('SentConfirmationPage — retention + audit trust signals', () => {
  it('surfaces the cryptographic audit-trail badge and 7-year retention notice referencing the verify path', async () => {
    renderAt('env-single');
    expect(await screen.findByText(/audit trail sealed/i)).toBeInTheDocument();
    // Retention copy includes the verify path with the envelope's short_code.
    expect(screen.getByText(/retains the sealed pdf/i)).toBeInTheDocument();
    expect(screen.getByText(/\/verify\/NDA-0001/)).toBeInTheDocument();
  });
});
