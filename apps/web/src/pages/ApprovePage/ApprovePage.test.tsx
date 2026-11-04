import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { axe } from 'vitest-axe';
import * as flagsModule from 'shared';
import { renderWithTheme } from '@/test/renderWithTheme';
import {
  FAKE_CSRF,
  FAKE_TOKEN,
  fakeCard,
  fakeSummary,
  MANY_RECIPIENTS,
} from '@/features/approvals/fixtures';

const postMock = vi.fn();

vi.mock('@/features/approvals/approvalsPublicClient', () => ({
  approvalsPublicClient: {
    post: (...args: unknown[]): unknown => postMock(...args),
  },
}));

import { ApprovePage, tokenFromHash } from './ApprovePage';

function renderPage(entry = `/approve#${FAKE_TOKEN}`) {
  window.history.replaceState(null, '', entry);
  return renderWithTheme(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/approve" element={<ApprovePage />} />
        <Route path="/approve/:id/review" element={<h1>Review stub</h1>} />
        <Route path="/settings/developers" element={<h1>Developers stub</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

function ok(card: ReturnType<typeof fakeCard>) {
  return Promise.resolve({ data: card });
}

function apiError(status: number, slug: string): Error {
  return Object.assign(new Error(slug), { status, slug });
}

describe('ApprovePage', () => {
  beforeEach(() => {
    postMock.mockReset();
    vi.spyOn(flagsModule, 'isFeatureEnabled').mockImplementation(
      (flag: string) => flag === 'mcpServer',
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it('previews on load, never decides, and removes the token from the address bar', async () => {
    postMock.mockReturnValue(ok(fakeCard()));
    renderPage();

    expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledWith('/approvals/from-email/preview', { token: FAKE_TOKEN });
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain(FAKE_TOKEN);
    expect(document.title).toBe('Approve a request · Seald');
  });

  it('previews once even when the effect runs twice (StrictMode)', async () => {
    postMock.mockReturnValue(ok(fakeCard()));
    window.history.replaceState(null, '', `/approve#${FAKE_TOKEN}`);
    renderWithTheme(
      <StrictMode>
        <MemoryRouter initialEntries={[`/approve#${FAKE_TOKEN}`]}>
          <Routes>
            <Route path="/approve" element={<ApprovePage />} />
          </Routes>
        </MemoryRouter>
      </StrictMode>,
    );
    await screen.findByRole('button', { name: 'Approve' });
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it('shows the card with Approve, Deny and Review fields when every recipient is known', async () => {
    postMock.mockReturnValue(ok(fakeCard()));
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Send for signature' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deny' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review fields' })).toBeInTheDocument();
    expect(screen.getByText('Expires in 23h')).toBeInTheDocument();
  });

  it('Approve posts the token, the decision and the CSRF value, then shows Approved', async () => {
    const user = userEvent.setup();
    postMock.mockReturnValueOnce(ok(fakeCard()));
    postMock.mockReturnValueOnce(ok(fakeCard({ state: 'done', decided: true, csrf: undefined })));
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Approve' }));

    expect(postMock).toHaveBeenLastCalledWith('/approvals/from-email', {
      token: FAKE_TOKEN,
      decision: 'approve',
      csrf: FAKE_CSRF,
    });
    expect(await screen.findByRole('status', { name: 'Approved' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });

  it('Deny posts the decision and offers to revoke the key', async () => {
    const user = userEvent.setup();
    postMock.mockReturnValueOnce(ok(fakeCard()));
    postMock.mockReturnValueOnce(ok(fakeCard({ state: 'denied', decided: true, csrf: undefined })));
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Deny' }));

    expect(postMock).toHaveBeenLastCalledWith('/approvals/from-email', {
      token: FAKE_TOKEN,
      decision: 'deny',
      csrf: FAKE_CSRF,
    });
    expect(await screen.findByRole('status', { name: 'Denied' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Revoke this key' })).toHaveAttribute(
      'href',
      '/settings/developers',
    );
  });

  it('a request that needs a session says "Sign in to approve" and opens the review', async () => {
    const user = userEvent.setup();
    postMock.mockReturnValue(
      ok(
        fakeCard({
          approve_requires: 'session',
          summary: fakeSummary({ recipients: MANY_RECIPIENTS }),
        }),
      ),
    );
    renderPage();

    const signIn = await screen.findByRole('button', { name: 'Sign in to approve' });
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review fields' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deny' })).toBeInTheDocument();

    await user.click(signIn);
    expect(await screen.findByRole('heading', { name: 'Review stub' })).toBeInTheDocument();
    // Only the preview was sent; opening the review decides nothing.
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it('switches to "Sign in to approve" when the server answers session_required', async () => {
    const user = userEvent.setup();
    postMock.mockReturnValueOnce(ok(fakeCard()));
    postMock.mockRejectedValueOnce(apiError(403, 'session_required'));
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Approve' }));

    expect(await screen.findByRole('button', { name: 'Sign in to approve' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('needs you to sign in');
  });

  it('refreshes the CSRF value after csrf_invalid and asks to try again', async () => {
    const user = userEvent.setup();
    postMock.mockReturnValueOnce(ok(fakeCard()));
    postMock.mockRejectedValueOnce(apiError(403, 'csrf_invalid'));
    postMock.mockReturnValueOnce(ok(fakeCard({ csrf: 'd'.repeat(43) })));
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Approve' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Please try again');
    expect(postMock).toHaveBeenCalledTimes(3);
    expect(postMock).toHaveBeenLastCalledWith('/approvals/from-email/preview', {
      token: FAKE_TOKEN,
    });
  });

  it('tells a flooded page to wait', async () => {
    const user = userEvent.setup();
    postMock.mockReturnValueOnce(ok(fakeCard()));
    postMock.mockRejectedValueOnce(apiError(429, 'ThrottlerException: Too Many Requests'));
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many tries');
  });

  it.each([
    ['expired', 'Expired'],
    ['superseded', 'Updated, see the newest email'],
    ['done', 'Approved'],
    ['denied', 'Denied'],
  ] as const)('shows %s without any button to decide', async (state, name) => {
    postMock.mockReturnValue(ok(fakeCard({ state, csrf: undefined })));
    renderPage();

    expect(await screen.findByRole('status', { name })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Deny' })).not.toBeInTheDocument();
  });

  it('shows Failed with the reason for a stored result_slug', async () => {
    postMock.mockReturnValue(
      ok(fakeCard({ state: 'failed', result_slug: 'api_key_revoked', csrf: undefined })),
    );
    renderPage();

    const failed = await screen.findByRole('status', { name: 'Failed' });
    expect(failed).toHaveTextContent('The key that asked was revoked');
    expect(failed).toHaveTextContent(/nothing was sent/i);
  });

  it('shows Expired for a token the server does not know', async () => {
    postMock.mockReturnValue(ok({ state: 'expired' }));
    renderPage();
    expect(await screen.findByRole('status', { name: 'Expired' })).toBeInTheDocument();
  });

  it('treats a link without a usable token as incomplete and calls nothing', async () => {
    renderPage('/approve#short');
    expect(await screen.findByRole('status', { name: 'Expired' })).toHaveTextContent('incomplete');
    expect(postMock).not.toHaveBeenCalled();
  });

  it('renders not found, and calls nothing, when the feature is off', () => {
    vi.spyOn(flagsModule, 'isFeatureEnabled').mockReturnValue(false);
    renderPage();
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();
  });

  it('renders not found when the API answers 404 (flag off on the server)', async () => {
    postMock.mockRejectedValue(apiError(404, 'not_found'));
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('shows a retry message when the preview cannot be reached', async () => {
    postMock.mockRejectedValueOnce(new Error('approval_request_failed'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('could not load');
    // The error has an exit: Try again previews once more, in place.
    postMock.mockReturnValue(ok(fakeCard()));
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Deny' })).toBeInTheDocument();
    expect(postMock).toHaveBeenCalledTimes(2);
  });

  it('pre-focuses Deny for ?intent=deny without acting', async () => {
    postMock.mockReturnValue(ok(fakeCard()));
    renderPage(`/approve?intent=deny#${FAKE_TOKEN}`);

    const deny = await screen.findByRole('button', { name: 'Deny' });
    await waitFor(() => {
      expect(deny).toHaveFocus();
    });
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it('never writes the token to the console', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => undefined),
    );
    const user = userEvent.setup();
    postMock.mockReturnValueOnce(ok(fakeCard()));
    postMock.mockRejectedValueOnce(apiError(500, 'internal_error'));
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Approve' }));
    await screen.findByRole('alert');

    for (const spy of spies) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(FAKE_TOKEN);
    }
    expect(document.body.textContent).not.toContain(FAKE_TOKEN);
  });

  it('has no axe violations on a pending card', async () => {
    postMock.mockReturnValue(
      ok(fakeCard({ summary: fakeSummary({ recipients: MANY_RECIPIENTS }) })),
    );
    const { container } = renderPage();
    await screen.findByRole('button', { name: 'Approve' });
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('tokenFromHash', () => {
  it('accepts exactly a 43-character base64url token', () => {
    expect(tokenFromHash(`#${FAKE_TOKEN}`)).toBe(FAKE_TOKEN);
    expect(tokenFromHash(FAKE_TOKEN)).toBe(FAKE_TOKEN);
    expect(tokenFromHash('#short')).toBeNull();
    expect(tokenFromHash(`#${FAKE_TOKEN}x`)).toBeNull();
    expect(tokenFromHash('')).toBeNull();
    expect(tokenFromHash(`#${'+'.repeat(43)}`)).toBeNull();
  });
});
