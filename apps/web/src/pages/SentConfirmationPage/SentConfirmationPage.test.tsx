import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';

// The page resolves the envelope via either local AppState (drafts) or
// `/envelopes/:id`. Stub the API so the "loaded" branch renders predictably
// when no local draft exists for the test envelope id.
vi.mock('../../lib/api/apiClient', () => ({
  apiClient: {
    get: vi.fn(async (url: string) => {
      if (url.startsWith('/envelopes/env-test')) {
        return {
          status: 200,
          data: {
            id: 'env-test',
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
                signed_at: null,
                declined_at: null,
              },
            ],
          },
        };
      }
      return { status: 200, data: { items: [], next_cursor: null } };
    }),
    post: vi.fn(async () => ({ status: 200, data: {} })),
    patch: vi.fn(async () => ({ status: 200, data: {} })),
    delete: vi.fn(async () => ({ status: 204, data: null })),
  },
}));

// eslint-disable-next-line import/first
import { SentConfirmationPage } from './SentConfirmationPage';

describe('SentConfirmationPage', () => {
  it('renders the sealed-confirmation hero once the envelope loads from the API', async () => {
    renderWithProviders(
      <MemoryRouter initialEntries={['/sent/env-test']}>
        <Routes>
          <Route path="/sent/:id" element={<SentConfirmationPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: /sent\. your envelope is on its way/i }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/maya raskin/i)).toBeInTheDocument();
  });
});
