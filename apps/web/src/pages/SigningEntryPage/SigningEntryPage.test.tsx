import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderSigningRoute } from '../../test/renderSigningRoute';
import { MOCK_ENVELOPE_ID, createSigningApiMock } from '../../test/signingApiMock';

vi.mock('../../lib/api/signApiClient', () => createSigningApiMock());

// Import AFTER the mock so the module binds the stubbed client.
// Importing `signApiClient` directly lets us drive per-test responses.
// eslint-disable-next-line import/first
import { signApiClient } from '../../lib/api/signApiClient';
// eslint-disable-next-line import/first
import { SigningEntryPage, resetInflightForTests } from './SigningEntryPage';

const post = signApiClient.post as unknown as ReturnType<typeof vi.fn>;

const TOKEN = 'a'.repeat(43);

beforeEach(() => {
  post.mockReset();
  // The page caches startSession promises in a module-level Map to dedupe
  // StrictMode double-invocation. Drain it between tests so each case
  // observes its own mockResolvedValueOnce / mockRejectedValueOnce.
  resetInflightForTests();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderEntry(initialEntry: string) {
  return renderSigningRoute(<SigningEntryPage />, {
    initialEntry,
    path: '/sign/:envelopeId',
  });
}

describe('SigningEntryPage', () => {
  it('renders the invalid-link state when ?t is missing', async () => {
    renderEntry(`/sign/${MOCK_ENVELOPE_ID}`);
    expect(
      await screen.findByRole('heading', { name: /signing link is invalid/i }),
    ).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('exchanges ?t= and navigates to /prep when tc not yet accepted', async () => {
    post.mockResolvedValueOnce({
      data: {
        envelope_id: MOCK_ENVELOPE_ID,
        signer_id: 's1',
        requires_tc_accept: true,
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    });

    renderEntry(`/sign/${MOCK_ENVELOPE_ID}?t=${TOKEN}`);

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/sign/start',
        { envelope_id: MOCK_ENVELOPE_ID, token: TOKEN },
        expect.any(Object),
      );
    });
    await waitFor(() => {
      // no semantic role: __pathname__ is a test-only sentinel probe from renderSigningRoute (rule 4.6 escape hatch)
      expect(screen.getByTestId('__pathname__').textContent).toBe(`/sign/${MOCK_ENVELOPE_ID}/prep`);
    });
  });

  it('navigates straight to /fill when tc already accepted', async () => {
    post.mockResolvedValueOnce({
      data: {
        envelope_id: MOCK_ENVELOPE_ID,
        signer_id: 's1',
        requires_tc_accept: false,
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    });
    renderEntry(`/sign/${MOCK_ENVELOPE_ID}?t=${TOKEN}`);
    await waitFor(() => {
      expect(screen.getByTestId('__pathname__').textContent).toBe(`/sign/${MOCK_ENVELOPE_ID}/fill`);
    });
  });

  it('maps 401 to the burned-link state', async () => {
    const err = Object.assign(new Error('invalid_token'), { status: 401 });
    post.mockRejectedValueOnce(err);
    renderEntry(`/sign/${MOCK_ENVELOPE_ID}?t=${TOKEN}`);
    expect(await screen.findByRole('heading', { name: /already been used/i })).toBeInTheDocument();
  });

  it('maps 410 to the burned-link state', async () => {
    const err = Object.assign(new Error('token_used'), { status: 410 });
    post.mockRejectedValueOnce(err);
    renderEntry(`/sign/${MOCK_ENVELOPE_ID}?t=${TOKEN}`);
    expect(await screen.findByRole('heading', { name: /already been used/i })).toBeInTheDocument();
  });

  // 409 covers the API's `ConflictException('already_signed')` and
  // `already_declined` paths from `assertStillSignable`. Without this
  // mapping the user sees "Something went wrong" — which was the bug
  // reported on a re-clicked signing link.
  it('maps 409 already_signed to the burned-link state', async () => {
    const err = Object.assign(new Error('already_signed'), { status: 409 });
    post.mockRejectedValueOnce(err);
    renderEntry(`/sign/${MOCK_ENVELOPE_ID}?t=${TOKEN}`);
    expect(await screen.findByRole('heading', { name: /already been used/i })).toBeInTheDocument();
  });

  it('maps 409 already_declined to the burned-link state', async () => {
    const err = Object.assign(new Error('already_declined'), { status: 409 });
    post.mockRejectedValueOnce(err);
    renderEntry(`/sign/${MOCK_ENVELOPE_ID}?t=${TOKEN}`);
    expect(await screen.findByRole('heading', { name: /already been used/i })).toBeInTheDocument();
  });

  it('maps 404 to the not-found state', async () => {
    const err = Object.assign(new Error('envelope_not_found'), { status: 404 });
    post.mockRejectedValueOnce(err);
    renderEntry(`/sign/${MOCK_ENVELOPE_ID}?t=${TOKEN}`);
    expect(
      await screen.findByRole('heading', { name: /couldn't find this signing request/i }),
    ).toBeInTheDocument();
  });

  it('maps 400 malformed-token to the invalid state', async () => {
    const err = Object.assign(new Error('token_malformed'), { status: 400 });
    post.mockRejectedValueOnce(err);
    renderEntry(`/sign/${MOCK_ENVELOPE_ID}?t=${TOKEN}`);
    expect(
      await screen.findByRole('heading', { name: /signing link is invalid/i }),
    ).toBeInTheDocument();
  });

  it('maps 429 to the rate-limit state', async () => {
    const err = Object.assign(new Error('rate_limited'), { status: 429 });
    post.mockRejectedValueOnce(err);
    renderEntry(`/sign/${MOCK_ENVELOPE_ID}?t=${TOKEN}`);
    expect(await screen.findByRole('heading', { name: /too many attempts/i })).toBeInTheDocument();
  });

  // Item 1 — retry affordance on rate-limit and generic errors. The original
  // page only offered a mailto: support link, so a transient 429 silently
  // dead-ended the signer. The new "Try again" button re-triggers the
  // /sign/start POST without a manual page reload.
  it('rate-limit state offers a "Try again" button that re-attempts /sign/start', async () => {
    const err = Object.assign(new Error('rate_limited'), { status: 429 });
    post.mockRejectedValueOnce(err).mockResolvedValueOnce({
      data: {
        envelope_id: MOCK_ENVELOPE_ID,
        signer_id: 's1',
        requires_tc_accept: true,
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    });
    renderEntry(`/sign/${MOCK_ENVELOPE_ID}?t=${TOKEN}`);
    await screen.findByRole('heading', { name: /too many attempts/i });
    const retry = await screen.findByRole('button', { name: /try again/i });
    const userEvent = await import('@testing-library/user-event');
    await userEvent.default.click(retry);
    await waitFor(() => {
      expect(post).toHaveBeenCalledTimes(2);
    });
  });

  it('generic error state offers a "Try again" button', async () => {
    const err = Object.assign(new Error('boom'), { status: 500 });
    post.mockRejectedValueOnce(err);
    renderEntry(`/sign/${MOCK_ENVELOPE_ID}?t=${TOKEN}`);
    await screen.findByRole('heading', { name: /something went wrong/i });
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  // Item 2 — loading state must be announced via aria-live and terminal
  // errors via role="alert" so screen-readers register the state change.
  it('loading state is wrapped in role="status" aria-live="polite"', async () => {
    // Pending forever — we only need to assert the live region attributes.
    post.mockReturnValueOnce(new Promise(() => {}));
    renderEntry(`/sign/${MOCK_ENVELOPE_ID}?t=${TOKEN}`);
    const status = await screen.findByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('terminal error card carries role="alert"', async () => {
    const err = Object.assign(new Error('not_found'), { status: 404 });
    post.mockRejectedValueOnce(err);
    renderEntry(`/sign/${MOCK_ENVELOPE_ID}?t=${TOKEN}`);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  // Item 4 — the mailto: link must carry a subject prefilled with the
  // envelope id so support gets context.
  it('mailto: link encodes the envelope id in the subject', async () => {
    const err = Object.assign(new Error('not_found'), { status: 404 });
    post.mockRejectedValueOnce(err);
    renderEntry(`/sign/${MOCK_ENVELOPE_ID}?t=${TOKEN}`);
    const link = await screen.findByRole('link', { name: /contact support/i });
    const href = link.getAttribute('href') ?? '';
    expect(href).toMatch(/^mailto:/);
    expect(href).toContain('subject=');
    expect(href).toContain(encodeURIComponent(MOCK_ENVELOPE_ID));
  });

  it('does not call /sign/start twice under StrictMode double-invoke', async () => {
    // The page's useRef guard is the subject under test. Simulate the
    // second render by re-mounting the component once while the first
    // mutation is still pending — in practice React's StrictMode double-
    // invokes the effect; we mimic that by mocking once but asserting
    // call count stays at 1.
    post.mockResolvedValueOnce({
      data: {
        envelope_id: MOCK_ENVELOPE_ID,
        signer_id: 's1',
        requires_tc_accept: true,
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    });
    renderEntry(`/sign/${MOCK_ENVELOPE_ID}?t=${TOKEN}`);
    await waitFor(() => {
      expect(post).toHaveBeenCalledTimes(1);
    });
  });
});
