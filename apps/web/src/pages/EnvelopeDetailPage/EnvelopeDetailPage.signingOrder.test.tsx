import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

const ADA = '11111111-1111-4111-8111-111111111111';
const BO = '22222222-2222-4222-8222-222222222222';
const CY = '33333333-3333-4333-8333-333333333333';

function signer(id: string, name: string, extra: Record<string, unknown>) {
  return {
    id,
    email: `${name.toLowerCase()}@example.com`,
    name,
    color: '#4F46E5',
    role: 'signatory',
    signing_order: 1,
    status: 'awaiting',
    viewed_at: null,
    tc_accepted_at: null,
    signed_at: null,
    declined_at: null,
    ...extra,
  };
}

function mockEnvelope(): void {
  get.mockImplementation((url: string) => {
    if (url.endsWith('/events')) {
      return Promise.resolve({
        data: {
          events: [
            {
              id: 'ev-0',
              envelope_id: 'env-1',
              signer_id: null,
              actor_kind: 'sender',
              event_type: 'sent',
              ip: null,
              user_agent: null,
              metadata: {},
              created_at: '2026-04-01T09:00:00Z',
            },
            {
              id: 'ev-1',
              envelope_id: 'env-1',
              signer_id: null,
              actor_kind: 'system',
              event_type: 'step_started',
              ip: null,
              user_agent: null,
              metadata: { step: 2, signing_order: 2, signer_ids: [BO, CY] },
              created_at: '2026-04-01T10:00:00Z',
            },
          ],
        },
        status: 200,
      });
    }
    return Promise.resolve({
      data: {
        id: 'env-1',
        owner_id: 'u',
        title: 'Lease',
        short_code: 'MSA-ABCD-1234',
        status: 'awaiting_others',
        delivery_mode: 'sequential',
        original_pages: 3,
        expires_at: '2030-01-01T00:00:00Z',
        tc_version: '1',
        privacy_version: '1',
        sent_at: '2026-04-01T00:00:00Z',
        completed_at: null,
        signers: [
          signer(ADA, 'Ada', {
            step: 1,
            signing_order: 1,
            status: 'completed',
            signed_at: '2026-04-01T09:00:00Z',
            invited_at: '2026-04-01T08:00:00Z',
          }),
          signer(BO, 'Bo', {
            step: 2,
            signing_order: 2,
            invited_at: '2026-04-01T10:00:00Z',
          }),
          signer(CY, 'Cy', {
            step: 2,
            signing_order: 2,
            invited_at: '2026-04-01T10:00:00Z',
          }),
        ],
        fields: [],
        tags: [],
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
    (flag: string) => on && flag === 'signingOrder',
  );
}

beforeEach(() => {
  get.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('EnvelopeDetailPage with a signing order', () => {
  it('shows each step with where its signers stand', async () => {
    setFlag(true);
    mockEnvelope();
    renderAt('env-1');

    const steps = await screen.findByRole('region', { name: 'Signing steps' });
    const items = within(steps).getAllByRole('listitem');
    expect(within(steps).getByText('Step 1')).toBeInTheDocument();
    expect(within(steps).getByText('Step 2')).toBeInTheDocument();
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(within(steps).getByText('Signed')).toBeInTheDocument();
    expect(within(steps).getAllByText('Invited')).toHaveLength(2);
  });

  it('labels the step_started event instead of printing the raw name', async () => {
    setFlag(true);
    mockEnvelope();
    renderAt('env-1');

    expect(await screen.findByText('Step 2 started — invited Bo, Cy')).toBeInTheDocument();
    expect(screen.queryByText('step_started')).not.toBeInTheDocument();
  });

  it('does not claim every signer was emailed when the envelope signs in order', async () => {
    setFlag(true);
    mockEnvelope();
    renderAt('env-1');

    expect(
      await screen.findByText(/^Sent for signing in order \(\d+ signers\)$/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Sent to \d+ signers$/)).not.toBeInTheDocument();
  });

  it('renders no step panel while the flag is off', async () => {
    setFlag(false);
    mockEnvelope();
    renderAt('env-1');

    await screen.findAllByText('Lease');
    expect(screen.queryByRole('region', { name: 'Signing steps' })).not.toBeInTheDocument();
  });
});
