import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { axe } from 'vitest-axe';
import * as flagsModule from 'shared';
import { renderWithProviders } from '@/test/renderWithProviders';
import { APPROVAL_ID, fakeDetail } from '@/features/approvals/fixtures';
import { RequireOwnerSession } from '@/features/approvals/RequireOwnerSession';

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock('@/lib/api/apiClient', () => ({
  apiClient: {
    get: (url: string, ...rest: unknown[]): unknown =>
      url.startsWith('/approvals') ? getMock(url, ...rest) : Promise.resolve({ data: [] }),
    post: (...args: unknown[]): unknown => postMock(...args),
  },
}));

import { ApproveDetailPage } from './ApproveDetailPage';
import { ApproveReviewPage } from '../ApproveReviewPage';
import { FAKE_KEY_SECRET, fakeOwnerDetail } from '@/features/approvals/owner/fixtures';

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{`${loc.pathname}${loc.search}`}</p>;
}

function renderCard(
  path = `/approve/${APPROVAL_ID}`,
  auth: Parameters<typeof renderWithProviders>[1] = {},
) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<RequireOwnerSession />}>
          <Route path="/approve/:id" element={<ApproveDetailPage />} />
          <Route path="/approve/:id/review" element={<Where />} />
        </Route>
        <Route path="/signin" element={<Where />} />
        <Route path="/settings/approvals" element={<h1>Queue stub</h1>} />
      </Routes>
    </MemoryRouter>,
    auth,
  );
}

function httpError(status: number, code?: string): Error {
  return Object.assign(new Error('failed'), { status, ...(code ? { code } : {}) });
}

describe('ApproveDetailPage', () => {
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

  it('shows the card with Approve, Deny and Review fields', async () => {
    getMock.mockResolvedValue({ data: fakeDetail() });
    renderCard();

    expect(await screen.findByRole('heading', { name: 'Send for signature' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deny' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review fields' })).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith(`/approvals/${APPROVAL_ID}`, expect.anything());
    expect(screen.getByRole('link', { name: 'All approvals' })).toHaveAttribute(
      'href',
      '/settings/approvals',
    );
  });

  it('Approve posts the in-app route and then shows the result', async () => {
    const user = userEvent.setup();
    // The refetch after the mutation sees the server's new state.
    getMock.mockResolvedValueOnce({ data: fakeDetail() });
    getMock.mockResolvedValue({ data: fakeDetail({ status: 'done' }) });
    postMock.mockResolvedValue({ data: fakeDetail({ status: 'done' }) });
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Approve' }));

    expect(postMock).toHaveBeenCalledWith(`/approvals/${APPROVAL_ID}/approve`);
    expect(await screen.findByRole('status', { name: 'Approved' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });

  it('Deny posts the in-app deny route', async () => {
    const user = userEvent.setup();
    getMock.mockResolvedValueOnce({ data: fakeDetail() });
    getMock.mockResolvedValue({ data: fakeDetail({ status: 'denied' }) });
    postMock.mockResolvedValue({ data: fakeDetail({ status: 'denied' }) });
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Deny' }));

    expect(postMock).toHaveBeenCalledWith(`/approvals/${APPROVAL_ID}/deny`);
    expect(await screen.findByRole('status', { name: 'Denied' })).toBeInTheDocument();
  });

  it('asks for a fresh sign-in on fresh_login_required and signs out to start one', async () => {
    const user = userEvent.setup();
    const signOut = vi.fn(() => Promise.resolve());
    getMock.mockResolvedValue({ data: fakeDetail() });
    postMock.mockRejectedValue(httpError(403, 'fresh_login_required'));
    renderCard(undefined, { auth: { signOut } });

    await user.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('sign-in from the last 12 hours');

    await user.click(screen.getByRole('button', { name: 'Sign in again' }));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('where')).toHaveTextContent(
      `/signin?next=${encodeURIComponent(`/approve/${APPROVAL_ID}`)}`,
    );
  });

  it('starts the fresh sign-in on arrival from the queue with ?reauth=1', async () => {
    const signOut = vi.fn(() => Promise.resolve());
    getMock.mockResolvedValue({ data: fakeDetail() });
    renderCard(`/approve/${APPROVAL_ID}?reauth=1`, { auth: { signOut } });

    await waitFor(() => {
      expect(signOut).toHaveBeenCalledTimes(1);
    });
    // The return trip carries the card path only, never ?reauth=1 again.
    expect(await screen.findByTestId('where')).toHaveTextContent(
      `/signin?next=${encodeURIComponent(`/approve/${APPROVAL_ID}`)}`,
    );
  });

  it('shows a handled approval as its result with no buttons', async () => {
    getMock.mockResolvedValue({
      data: fakeDetail({ status: 'failed', result_slug: 'api_key_expired' }),
    });
    renderCard();

    expect(await screen.findByRole('status', { name: 'Failed' })).toHaveTextContent('has expired');
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });

  it('shows the Fields updated badge after an owner edit', async () => {
    getMock.mockResolvedValue({
      data: fakeDetail({ fields_updated_at: '2026-10-22T09:21:00.000Z' }),
    });
    renderCard();
    expect(await screen.findByText(/^Fields updated/)).toBeInTheDocument();
  });

  it("renders not found for another account's approval (404)", async () => {
    getMock.mockRejectedValue(httpError(404));
    renderCard();
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('a load failure offers Try again, which loads the card in place', async () => {
    getMock.mockRejectedValueOnce(httpError(500)).mockResolvedValue({ data: fakeDetail() });
    renderCard();
    expect(await screen.findByRole('alert')).toHaveTextContent('could not load this request');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Send for signature' })).toBeInTheDocument();
  });

  it('sends a signed-out visitor to sign-in with ?next= set to this card', async () => {
    renderCard(undefined, { auth: { user: null } });
    expect(await screen.findByTestId('where')).toHaveTextContent(
      `/signin?next=${encodeURIComponent(`/approve/${APPROVAL_ID}`)}`,
    );
    expect(getMock).not.toHaveBeenCalled();
  });

  it('renders not found, and calls nothing, with the flag off', () => {
    vi.spyOn(flagsModule, 'isFeatureEnabled').mockReturnValue(false);
    renderCard();
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(getMock).not.toHaveBeenCalled();
  });

  it('has no axe violations', async () => {
    getMock.mockResolvedValue({ data: fakeDetail() });
    const { container } = renderCard();
    await screen.findByRole('button', { name: 'Approve' });
    expect(await axe(container)).toHaveNoViolations();
  });

  describe('WP-45 owner actions', () => {
    it('account deletion posts the typed email; a mismatch is explained and nothing more', async () => {
      const user = userEvent.setup();
      getMock.mockResolvedValue({ data: fakeOwnerDetail('account_delete') });
      postMock.mockRejectedValueOnce(httpError(400, 'confirmation_mismatch'));
      renderCard();

      expect(
        await screen.findByRole('heading', { name: 'Delete your Seald account' }),
      ).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Review fields' })).not.toBeInTheDocument();
      await user.type(
        screen.getByRole('textbox', { name: 'Type your account email to confirm' }),
        'owner@example.test',
      );
      await user.click(screen.getByRole('button', { name: 'Delete my account' }));
      expect(postMock).toHaveBeenCalledWith(`/approvals/${APPROVAL_ID}/approve`, {
        confirm_email: 'owner@example.test',
      });
      expect(await screen.findByRole('alert')).toHaveTextContent('not your account email');
    });

    it('an approved deletion signs out and leaves for sign-in', async () => {
      const user = userEvent.setup();
      const signOut = vi.fn(() => Promise.resolve());
      getMock.mockResolvedValueOnce({ data: fakeOwnerDetail('account_delete') });
      getMock.mockResolvedValue({ data: fakeOwnerDetail('account_delete', { status: 'done' }) });
      postMock.mockResolvedValue({ data: fakeOwnerDetail('account_delete', { status: 'done' }) });
      renderCard(undefined, { auth: { signOut } });
      await user.type(
        await screen.findByRole('textbox', { name: 'Type your account email to confirm' }),
        'owner@example.test',
      );
      await user.click(screen.getByRole('button', { name: 'Delete my account' }));
      await waitFor(() => {
        expect(signOut).toHaveBeenCalled();
      });
      expect(await screen.findByTestId('where')).toHaveTextContent('/signin');
    });

    it('a new key is shown once from the Approve response, and not after a reload', async () => {
      const user = userEvent.setup();
      getMock.mockResolvedValueOnce({ data: fakeOwnerDetail('api_key_create') });
      getMock.mockResolvedValue({ data: fakeOwnerDetail('api_key_create', { status: 'done' }) });
      postMock.mockResolvedValue({
        data: fakeOwnerDetail('api_key_create', {
          status: 'done',
          reveal: { api_key_secret: FAKE_KEY_SECRET },
        }),
      });
      renderCard();
      await user.click(await screen.findByRole('button', { name: 'Approve' }));
      expect(postMock).toHaveBeenCalledWith(`/approvals/${APPROVAL_ID}/approve`);
      expect(await screen.findByText(FAKE_KEY_SECRET)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Close' }));
      expect(screen.queryByText(FAKE_KEY_SECRET)).not.toBeInTheDocument();
    });

    it('asks for a sign-in from the last 10 minutes', async () => {
      const user = userEvent.setup();
      getMock.mockResolvedValue({ data: fakeOwnerDetail('api_key_revoke') });
      postMock.mockRejectedValue(httpError(403, 'fresh_login_required'));
      renderCard();
      await user.click(await screen.findByRole('button', { name: 'Approve' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'sign-in from the last 10 minutes',
      );
    });

    it('the review route of an owner action goes back to the card', async () => {
      getMock.mockResolvedValue({ data: fakeOwnerDetail('account_export') });
      renderWithProviders(
        <MemoryRouter initialEntries={[`/approve/${APPROVAL_ID}/review`]}>
          <Routes>
            <Route path="/approve/:id/review" element={<ApproveReviewPage />} />
            <Route path="/approve/:id" element={<Where />} />
          </Routes>
        </MemoryRouter>,
      );
      expect(await screen.findByTestId('where')).toHaveTextContent(`/approve/${APPROVAL_ID}`);
    });
  });
});
