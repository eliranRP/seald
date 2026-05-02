import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
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

  it('"Back to documents" sends a guest to /document/new (not /documents)', async () => {
    // `/documents` is gated by `RequireAuth` (not `RequireAuthOrGuest`)
    // so a guest landing there bounces back to `/document/new`. The
    // SentConfirmationPage now points the CTA straight at `/document/new`
    // for guests to skip the round-trip flash that surfaced the
    // user-reported "screen jumps back to fields" symptom.
    function LocationProbe(): React.ReactElement {
      const loc = useLocation();
      return <div data-pathname>{loc.pathname}</div>;
    }
    renderWithProviders(
      <MemoryRouter initialEntries={['/sent/env-test']}>
        <Routes>
          <Route
            path="/sent/:id"
            element={
              <>
                <SentConfirmationPage />
                <LocationProbe />
              </>
            }
          />
          <Route path="/document/new" element={<LocationProbe />} />
          <Route path="/documents" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
      { auth: { guest: true, user: null } },
    );

    // Wait for the page to hydrate from the API stub.
    await screen.findByRole('heading', { level: 1, name: /sent\. your envelope is on its way/i });

    const backBtn = screen.getByRole('button', { name: /back to documents/i });
    await userEvent.click(backBtn);

    const probe = await screen.findByText('/document/new');
    expect(probe).toBeInTheDocument();
  });

  it('"Back to documents" sends an authed user to /documents', async () => {
    function LocationProbe(): React.ReactElement {
      const loc = useLocation();
      return <div data-pathname>{loc.pathname}</div>;
    }
    renderWithProviders(
      <MemoryRouter initialEntries={['/sent/env-test']}>
        <Routes>
          <Route
            path="/sent/:id"
            element={
              <>
                <SentConfirmationPage />
                <LocationProbe />
              </>
            }
          />
          <Route path="/documents" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { level: 1, name: /sent\. your envelope is on its way/i });
    await userEvent.click(screen.getByRole('button', { name: /back to documents/i }));
    expect(await screen.findByText('/documents')).toBeInTheDocument();
  });
});
