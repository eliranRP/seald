import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import * as flagsModule from 'shared';
import { renderWithProviders } from '../test/renderWithProviders';
import { AppShell } from './AppShell';

/**
 * The approvals bell (WP-22) sits in the header for a signed-in owner when
 * `mcpServer` or `publicApi` is on, shows the pending count and opens the
 * queue. With both flags off there is no bell and no request.
 */
const getMock = vi.fn();

vi.mock('@/lib/api/apiClient', () => ({
  apiClient: {
    get: (url: string, ...rest: unknown[]): unknown =>
      url.startsWith('/approvals') ? getMock(url, ...rest) : Promise.resolve({ data: [] }),
  },
}));

vi.mock('@/features/account', () => ({
  useAccountActions: () => ({
    exportData: vi.fn(),
    deleteAccount: vi.fn(),
    isExporting: false,
    isDeleting: false,
  }),
}));

vi.mock('../hooks/useIsMobileViewport', () => ({
  useIsMobileViewport: () => false,
  readIsMobileViewport: () => false,
  MOBILE_VIEWPORT_QUERY: '(max-width: 640px)',
}));

function renderShell(auth: Parameters<typeof renderWithProviders>[1] = {}) {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/documents']}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/documents" element={<div>doc list</div>} />
          <Route path="/settings/approvals" element={<h1>queue stub</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
    auth,
  );
}

describe('AppShell approvals bell', () => {
  beforeEach(() => {
    getMock.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the pending count and opens the queue', async () => {
    const user = userEvent.setup();
    vi.spyOn(flagsModule, 'isFeatureEnabled').mockImplementation(
      (flag: string) => flag === 'mcpServer',
    );
    getMock.mockResolvedValue({ data: { items: [], next_cursor: null, pending_count: 3 } });
    renderShell();

    const bell = await screen.findByRole('button', { name: 'Notifications, 3 pending' });
    expect(getMock).toHaveBeenCalledWith(
      '/approvals',
      expect.objectContaining({ params: { limit: 1, status: 'pending' } }),
    );

    await user.click(bell);
    expect(await screen.findByRole('heading', { name: 'queue stub' })).toBeInTheDocument();
  });

  it('shows a plain bell at zero and survives a 404 from the API', async () => {
    vi.spyOn(flagsModule, 'isFeatureEnabled').mockImplementation(
      (flag: string) => flag === 'publicApi',
    );
    getMock.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));
    renderShell();
    expect(await screen.findByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('has no bell, and makes no request, with both flags off', () => {
    vi.spyOn(flagsModule, 'isFeatureEnabled').mockReturnValue(false);
    renderShell();
    expect(screen.queryByRole('button', { name: /^Notifications/ })).not.toBeInTheDocument();
    expect(getMock).not.toHaveBeenCalled();
  });

  it('has no bell for a guest', () => {
    vi.spyOn(flagsModule, 'isFeatureEnabled').mockImplementation(
      (flag: string) => flag === 'mcpServer',
    );
    renderShell({ auth: { user: null, guest: true } });
    expect(screen.queryByRole('button', { name: /^Notifications/ })).not.toBeInTheDocument();
    expect(getMock).not.toHaveBeenCalled();
  });
});
