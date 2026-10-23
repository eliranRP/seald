import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { axe } from 'vitest-axe';
import * as flagsModule from 'shared';
import { renderWithProviders } from '@/test/renderWithProviders';
import { APPROVAL_ID, fakeDetail, fakeSummary } from '@/features/approvals/fixtures';

// Only `/approvals…` reads reach `getMock`. The app-state provider's own
// reads (contacts) get an empty answer so they never consume a queued value.
const getMock = vi.fn();
const postMock = vi.fn();

vi.mock('@/lib/api/apiClient', () => ({
  apiClient: {
    get: (url: string, ...rest: unknown[]): unknown =>
      url.startsWith('/approvals') ? getMock(url, ...rest) : Promise.resolve({ data: [] }),
    post: (...args: unknown[]): unknown => postMock(...args),
  },
}));

import { ApproveQueuePage } from './ApproveQueuePage';

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{`${loc.pathname}${loc.search}`}</p>;
}

function renderQueue(path = '/settings/approvals') {
  return renderWithProviders(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/settings/approvals" element={<ApproveQueuePage variant="desktop" />} />
        <Route path="/m/settings/approvals" element={<ApproveQueuePage variant="mobile" />} />
        <Route path="/approve/:id" element={<Where />} />
        <Route path="/approve/:id/review" element={<Where />} />
        <Route path="/settings" element={<h1>Settings stub</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

function list(items: ReadonlyArray<ReturnType<typeof fakeDetail>>, next: string | null = null) {
  return Promise.resolve({
    data: {
      items,
      next_cursor: next,
      pending_count: items.filter((i) => i.status === 'pending').length,
    },
  });
}

function httpError(status: number, code?: string): Error {
  return Object.assign(new Error('failed'), { status, ...(code ? { code } : {}) });
}

const OTHER_ID = '44444444-4444-4444-8444-444444444444';

describe('ApproveQueuePage', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    vi.spyOn(flagsModule, 'isFeatureEnabled').mockImplementation(
      (flag: string) => flag === 'mcpServer',
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists waiting approvals with the key and the expiry', async () => {
    getMock.mockReturnValue(list([fakeDetail()]));
    renderQueue();

    const rows = await screen.findByRole('list', { name: 'Approvals' });
    const row = within(rows).getByRole('listitem');
    expect(within(row).getByRole('link', { name: 'Services agreement' })).toHaveAttribute(
      'href',
      `/approve/${APPROVAL_ID}`,
    );
    expect(row).toHaveTextContent('Waiting for you');
    expect(row).toHaveTextContent('Sent via Key 2');
    expect(row).toHaveTextContent('Expires in 23h');
    expect(getMock).toHaveBeenCalledWith(
      '/approvals',
      expect.objectContaining({ params: { limit: 20, status: 'pending' } }),
    );
    expect(screen.getByRole('heading', { name: 'Approvals' })).toBeInTheDocument();
  });

  it('Approve posts to the in-app route, and Deny to its own', async () => {
    const user = userEvent.setup();
    getMock.mockReturnValue(list([fakeDetail(), fakeDetail({ id: OTHER_ID })]));
    postMock.mockResolvedValue({ data: fakeDetail({ status: 'done' }) });
    renderQueue();

    const approveButtons = await screen.findAllByRole('button', {
      name: 'Approve Services agreement',
    });
    await user.click(approveButtons[0]!);
    expect(postMock).toHaveBeenLastCalledWith(`/approvals/${APPROVAL_ID}/approve`);

    const denyButtons = await screen.findAllByRole('button', { name: 'Deny Services agreement' });
    await user.click(denyButtons[1]!);
    expect(postMock).toHaveBeenLastCalledWith(`/approvals/${OTHER_ID}/deny`);
  });

  it('sends a stale session through sign-in and back to the same card', async () => {
    const user = userEvent.setup();
    getMock.mockReturnValue(list([fakeDetail()]));
    postMock.mockRejectedValue(httpError(403, 'fresh_login_required'));
    renderQueue();

    await user.click(await screen.findByRole('button', { name: 'Approve Services agreement' }));

    expect(await screen.findByTestId('where')).toHaveTextContent(
      `/approve/${APPROVAL_ID}?reauth=1`,
    );
  });

  it('shows an alert, and stays on the queue, when Approve fails another way', async () => {
    const user = userEvent.setup();
    getMock.mockReturnValue(list([fakeDetail()]));
    postMock.mockRejectedValue(httpError(409, 'approval_not_pending'));
    renderQueue();

    await user.click(await screen.findByRole('button', { name: 'Approve Services agreement' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('did not go through');
  });

  it('opens the guided review from a row', async () => {
    const user = userEvent.setup();
    getMock.mockReturnValue(list([fakeDetail()]));
    renderQueue();

    await user.click(
      await screen.findByRole('button', { name: 'Review fields for Services agreement' }),
    );
    expect(await screen.findByTestId('where')).toHaveTextContent(`/approve/${APPROVAL_ID}/review`);
  });

  it('shows decided rows under All, without decision buttons', async () => {
    const user = userEvent.setup();
    getMock.mockImplementation((_url: string, config: { params: { status?: string } }) =>
      config.params.status === 'pending'
        ? list([])
        : list([
            fakeDetail({ status: 'denied' }),
            fakeDetail({ id: OTHER_ID, status: 'failed', result_slug: 'api_key_revoked' }),
          ]),
    );
    renderQueue();

    expect(await screen.findByText('Nothing is waiting for you.')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /^All/ }));

    const rows = await screen.findByRole('list', { name: 'Approvals' });
    expect(within(rows).getByText('Denied')).toBeInTheDocument();
    expect(within(rows).getByText('Failed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Approve / })).not.toBeInTheDocument();
  });

  it('loads the next page on request', async () => {
    const user = userEvent.setup();
    getMock.mockReturnValueOnce(list([fakeDetail()], 'cursor-2'));
    getMock.mockReturnValueOnce(
      list([fakeDetail({ id: OTHER_ID, summary: fakeSummary({ title: 'Second deal' }) })]),
    );
    renderQueue();

    await user.click(await screen.findByRole('button', { name: 'Load more' }));

    expect(await screen.findByRole('link', { name: 'Second deal' })).toBeInTheDocument();
    expect(getMock).toHaveBeenLastCalledWith(
      '/approvals',
      expect.objectContaining({ params: expect.objectContaining({ cursor: 'cursor-2' }) }),
    );
  });

  it('renders the phone frame at /m/settings/approvals', async () => {
    getMock.mockReturnValue(list([]));
    renderQueue('/m/settings/approvals');
    expect(await screen.findByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Approvals' })).toBeInTheDocument();
  });

  it('renders not found, and calls nothing, with the flag off', () => {
    vi.spyOn(flagsModule, 'isFeatureEnabled').mockReturnValue(false);
    renderQueue();
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(getMock).not.toHaveBeenCalled();
  });

  it('renders not found when the API answers 404', async () => {
    getMock.mockRejectedValue(httpError(404));
    renderQueue();
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    getMock.mockReturnValue(list([fakeDetail()]));
    const { container } = renderQueue();
    await screen.findByRole('list', { name: 'Approvals' });
    expect(await axe(container)).toHaveNoViolations();
  });
});
