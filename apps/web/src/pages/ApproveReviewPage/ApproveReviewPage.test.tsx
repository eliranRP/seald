import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import * as flagsModule from 'shared';
import { renderWithProviders } from '@/test/renderWithProviders';
import { APPROVAL_ID, ENVELOPE_ID, fakeDetail, fakeEnvelope } from '@/features/approvals/fixtures';
import { RequireOwnerSession } from '@/features/approvals/RequireOwnerSession';

const approvalsGet = vi.fn();
const envelopeGet = vi.fn();
const postMock = vi.fn();

vi.mock('@/lib/api/apiClient', () => ({
  apiClient: {
    get: (url: string, ...rest: unknown[]): unknown => {
      if (url.startsWith('/approvals')) return approvalsGet(url, ...rest);
      if (url.endsWith('/download'))
        return Promise.resolve({ data: { url: '', kind: 'original' } });
      if (url.startsWith('/envelopes')) return envelopeGet(url, ...rest);
      return Promise.resolve({ data: [] });
    },
    post: (...args: unknown[]): unknown => postMock(...args),
  },
}));

vi.mock('@/lib/pdf', () => ({
  usePdfDocument: () => ({ doc: null, numPages: 0, loading: false, error: null }),
}));

import { ApproveReviewPage } from './ApproveReviewPage';

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{`${loc.pathname}${loc.search}`}</p>;
}

function renderReview(
  path = `/approve/${APPROVAL_ID}/review`,
  options: Parameters<typeof renderWithProviders>[1] = {},
) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<RequireOwnerSession />}>
          <Route path="/approve/:id/review" element={<ApproveReviewPage />} />
          <Route path="/approve/:id" element={<Where />} />
        </Route>
        <Route path="/signin" element={<Where />} />
        <Route path="/document/:id" element={<Where />} />
      </Routes>
    </MemoryRouter>,
    options,
  );
}

function httpError(status: number, code?: string): Error {
  return Object.assign(new Error('failed'), { status, ...(code ? { code } : {}) });
}

describe('ApproveReviewPage', () => {
  beforeEach(() => {
    approvalsGet.mockReset();
    envelopeGet.mockReset();
    postMock.mockReset();
    window.sessionStorage.clear();
    approvalsGet.mockResolvedValue({ data: fakeDetail() });
    envelopeGet.mockResolvedValue({ data: fakeEnvelope() });
    vi.spyOn(flagsModule, 'isFeatureEnabled').mockImplementation(
      (flag: string) => flag === 'mcpServer',
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens on page 1 without deciding anything', async () => {
    renderReview();

    expect(await screen.findByText(/Page 1 \/ 3/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();
    expect(envelopeGet).toHaveBeenCalledWith(`/envelopes/${ENVELOPE_ID}`, expect.anything());
  });

  it('starts on the page in ?page= and keeps the step in the address', async () => {
    const user = userEvent.setup();
    renderReview(`/approve/${APPROVAL_ID}/review?page=2`);

    expect(await screen.findByText(/Page 2 \/ 3/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText(/Page 3 \/ 3/)).toBeInTheDocument();
  });

  it('Approve uses the signed-in route and then shows the result', async () => {
    const user = userEvent.setup();
    approvalsGet.mockResolvedValueOnce({ data: fakeDetail() });
    approvalsGet.mockResolvedValue({ data: fakeDetail({ status: 'done' }) });
    postMock.mockResolvedValue({ data: fakeDetail({ status: 'done' }) });
    renderReview();

    await user.click(await screen.findByRole('button', { name: 'Approve' }));

    expect(postMock).toHaveBeenCalledWith(`/approvals/${APPROVAL_ID}/approve`);
    expect(await screen.findByRole('status', { name: 'Approved' })).toBeInTheDocument();
  });

  it('asks the owner to sign in again when the session is older than 12 hours', async () => {
    const user = userEvent.setup();
    const signOut = vi.fn(() => Promise.resolve());
    postMock.mockRejectedValue(httpError(403, 'fresh_login_required'));
    renderReview(undefined, { auth: { signOut } });

    await user.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('sign-in from the last 12 hours');

    await user.click(screen.getByRole('button', { name: 'Sign in again' }));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('where')).toHaveTextContent(
      `/signin?next=${encodeURIComponent(`/approve/${APPROVAL_ID}/review?page=1`)}`,
    );
  });

  it('Edit opens the field editor and marks the approval for a refresh on return', async () => {
    const user = userEvent.setup();
    renderReview();

    await user.click(await screen.findByRole('button', { name: 'Edit' }));

    expect(await screen.findByTestId('where')).toHaveTextContent(`/document/${ENVELOPE_ID}`);
    expect(window.sessionStorage.getItem('seald.approval.editing')).toBe(APPROVAL_ID);
  });

  it('refreshes the approval once after the owner comes back from the editor', async () => {
    window.sessionStorage.setItem('seald.approval.editing', APPROVAL_ID);
    postMock.mockResolvedValue({
      data: fakeDetail({ fields_updated_at: '2026-10-22T09:21:00.000Z' }),
    });
    renderReview();

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith(`/approvals/${APPROVAL_ID}/refresh`);
    });
    expect(window.sessionStorage.getItem('seald.approval.editing')).toBeNull();
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it('shows the result, not the review, for an approval that is already handled', async () => {
    approvalsGet.mockResolvedValue({ data: fakeDetail({ status: 'denied' }) });
    renderReview();

    expect(await screen.findByRole('status', { name: 'Denied' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the approval' })).toHaveAttribute(
      'href',
      `/approve/${APPROVAL_ID}`,
    );
  });

  it('says there is nothing to review for an approval with no envelope', async () => {
    approvalsGet.mockResolvedValue({ data: fakeDetail({ envelope_id: null }) });
    renderReview();
    expect(
      await screen.findByText('There is nothing to review for this request.'),
    ).toBeInTheDocument();
  });

  it("renders not found for another account's approval", async () => {
    approvalsGet.mockRejectedValue(httpError(404));
    renderReview();
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('sends a signed-out visitor to sign-in with ?next= set to the review', async () => {
    renderReview(`/approve/${APPROVAL_ID}/review?page=2`, { auth: { user: null } });
    expect(await screen.findByTestId('where')).toHaveTextContent(
      `/signin?next=${encodeURIComponent(`/approve/${APPROVAL_ID}/review?page=2`)}`,
    );
    expect(approvalsGet).not.toHaveBeenCalled();
  });

  it('renders not found, and calls nothing, with the flag off', () => {
    vi.spyOn(flagsModule, 'isFeatureEnabled').mockReturnValue(false);
    renderReview();
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(approvalsGet).not.toHaveBeenCalled();
  });
});
