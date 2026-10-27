import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { axe } from 'vitest-axe';
import type { FeatureFlag, OAuthConsentDescription } from 'shared';
import { renderWithProviders } from '@/test/renderWithProviders';

const postMock = vi.fn();

vi.mock('@/lib/api/apiClient', () => ({
  apiClient: {
    get: (): unknown => Promise.resolve({ data: {} }),
    post: (...args: unknown[]): unknown => postMock(...args),
  },
}));

import { OAuthConsentPage } from './OAuthConsentPage';
import { readStashedRequest } from './consentModel';

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;

const QUERY = new URLSearchParams({
  response_type: 'code',
  client_id: 'claude-test',
  redirect_uri: 'https://claude.example/api/mcp/auth_callback',
  code_challenge: 'c'.repeat(43),
  code_challenge_method: 'S256',
  scope: 'envelopes:read envelopes:send',
  state: 'xyz',
  resource: 'https://api.seald.test/mcp',
}).toString();

function description(over: Partial<OAuthConsentDescription> = {}): OAuthConsentDescription {
  return {
    client_name: 'Claude',
    redirect_host: 'claude.example',
    unverified: false,
    scopes: ['envelopes:read', 'envelopes:send'],
    fresh_login_required: false,
    ...over,
  };
}

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{`${loc.pathname}${loc.search}`}</p>;
}

function renderPage(
  path = `/oauth/mcp/consent?${QUERY}`,
  auth: Parameters<typeof renderWithProviders>[1] = {},
  onRedirect = vi.fn(),
) {
  const view = renderWithProviders(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/oauth/mcp/consent" element={<OAuthConsentPage onRedirect={onRedirect} />} />
        <Route path="/signin" element={<Where />} />
      </Routes>
    </MemoryRouter>,
    auth,
  );
  return { ...view, onRedirect };
}

function httpError(status: number, code?: string): Error {
  return Object.assign(new Error('failed'), { status, ...(code ? { code } : {}) });
}

describe('OAuthConsentPage', () => {
  beforeEach(() => {
    postMock.mockReset();
    host.__SEALD_FEATURE_OVERRIDES__ = { mcpServer: true, mcpOauth: true };
    window.sessionStorage.clear();
  });
  afterEach(() => {
    delete host.__SEALD_FEATURE_OVERRIDES__;
  });

  it('shows the app, where it returns and what it may do, in key-scope words', async () => {
    postMock.mockResolvedValue({ data: description() });
    const { container } = renderPage();

    const card = await screen.findByRole('region', { name: 'Claude' });
    expect(within(card).getByText('claude.example')).toBeInTheDocument();
    const access = within(card).getByRole('list', { name: 'Requested access' });
    expect(within(access).getByText('Read documents')).toBeInTheDocument();
    expect(within(access).getByText('Send and remind')).toBeInTheDocument();
    expect(within(card).getByText('jamie@seald.app')).toBeInTheDocument();
    expect(within(card).queryByText('Unverified')).not.toBeInTheDocument();
    expect(postMock).toHaveBeenCalledWith(
      '/oauth/consent/describe',
      expect.objectContaining({ client_id: 'claude-test', state: 'xyz' }),
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('labels an unverified app', async () => {
    postMock.mockResolvedValue({
      data: description({
        client_name: 'Agent',
        redirect_host: 'agent.example.org',
        unverified: true,
      }),
    });
    renderPage();
    const card = await screen.findByRole('region', { name: /Agent/ });
    expect(within(card).getByText('Unverified')).toBeInTheDocument();
    expect(within(card).getByText(/Seald has not checked this app/)).toBeInTheDocument();
  });

  it('Approve posts the decision and leaves for the app with the code', async () => {
    const user = userEvent.setup();
    postMock.mockImplementation(async (url: string) =>
      url === '/oauth/consent/describe'
        ? { data: description() }
        : {
            data: {
              redirect_to: 'https://claude.example/api/mcp/auth_callback?code=abc&state=xyz',
            },
          },
    );
    const { onRedirect } = renderPage();
    await user.click(await screen.findByRole('button', { name: 'Allow access' }));
    await waitFor(() => {
      expect(onRedirect).toHaveBeenCalledWith(
        'https://claude.example/api/mcp/auth_callback?code=abc&state=xyz',
      );
    });
    expect(postMock).toHaveBeenLastCalledWith(
      '/oauth/consent',
      expect.objectContaining({ decision: 'approve', client_id: 'claude-test' }),
    );
  });

  it('Deny posts deny and leaves for the app', async () => {
    const user = userEvent.setup();
    postMock.mockImplementation(async (url: string) =>
      url === '/oauth/consent/describe'
        ? { data: description() }
        : { data: { redirect_to: 'https://claude.example/cb?error=access_denied&state=xyz' } },
    );
    const { onRedirect } = renderPage();
    await user.click(await screen.findByRole('button', { name: 'Deny' }));
    await waitFor(() => {
      expect(onRedirect).toHaveBeenCalledWith(
        'https://claude.example/cb?error=access_denied&state=xyz',
      );
    });
    expect(postMock).toHaveBeenLastCalledWith(
      '/oauth/consent',
      expect.objectContaining({ decision: 'deny' }),
    );
  });

  it('a stale sign-in for send access: Approve is off and Sign in again keeps the request', async () => {
    const user = userEvent.setup();
    const signOut = vi.fn(() => Promise.resolve());
    postMock.mockResolvedValue({ data: description({ fresh_login_required: true }) });
    renderPage(undefined, { auth: { signOut } });
    expect(await screen.findByRole('button', { name: 'Allow access' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Sign in again' }));
    expect(signOut).toHaveBeenCalled();
    expect(await screen.findByTestId('where')).toHaveTextContent(
      '/signin?next=%2Foauth%2Fmcp%2Fconsent',
    );
    expect(readStashedRequest()?.client_id).toBe('claude-test');
  });

  it('a server-side fresh_login_required on Approve asks for a new sign-in', async () => {
    const user = userEvent.setup();
    postMock.mockImplementation(async (url: string) => {
      if (url === '/oauth/consent/describe') return { data: description() };
      throw httpError(403, 'fresh_login_required');
    });
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Allow access' }));
    expect(await screen.findByRole('button', { name: 'Sign in again' })).toBeInTheDocument();
  });

  it('signed out: parks the request and goes to sign-in, then picks it up again', async () => {
    renderPage(undefined, { auth: { user: null } });
    expect(await screen.findByTestId('where')).toHaveTextContent(
      '/signin?next=%2Foauth%2Fmcp%2Fconsent',
    );
    expect(postMock).not.toHaveBeenCalled();

    postMock.mockResolvedValue({ data: description() });
    renderPage('/oauth/mcp/consent');
    expect(await screen.findByRole('region', { name: 'Claude' })).toBeInTheDocument();
  });

  it('explains an untrusted client or redirect sent back by /oauth/authorize', async () => {
    renderPage('/oauth/mcp/consent?error=invalid_redirect_uri');
    expect(await screen.findByRole('alert')).toHaveTextContent('not allowed to');
    expect(screen.queryByRole('button', { name: 'Allow access' })).not.toBeInTheDocument();
  });

  it('a request the API refuses shows an error and no buttons', async () => {
    postMock.mockRejectedValue(httpError(400, 'invalid_client'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Seald does not know this app');
    expect(screen.queryByRole('button', { name: 'Allow access' })).not.toBeInTheDocument();
  });

  it('a session without an email account cannot connect apps', async () => {
    postMock.mockRejectedValue(httpError(403, 'email_required'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('email account');
  });

  it('is not available while the flag is off', () => {
    host.__SEALD_FEATURE_OVERRIDES__ = { mcpServer: true, mcpOauth: false };
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Not available.');
    expect(postMock).not.toHaveBeenCalled();
  });
});
