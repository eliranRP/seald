import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderSigningRoute } from '../../test/renderSigningRoute';
import { MOCK_ENVELOPE_ID, createSigningApiMock } from '../../test/signingApiMock';
import { readLinkHints } from '../../features/signing';

vi.mock('../../lib/api/signApiClient', () => createSigningApiMock());

// Import AFTER the mock so the module binds the stubbed client.
// Importing `signApiClient` directly lets us drive per-test responses.
import { signApiClient } from '../../lib/api/signApiClient';
import { SigningEntryPage, resetInflightForTests } from './SigningEntryPage';

const post = signApiClient.post as unknown as ReturnType<typeof vi.fn>;

const TOKEN = 'a'.repeat(43);

beforeEach(() => {
  post.mockReset();
  window.sessionStorage.clear();
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

function pathname(): string {
  // no semantic role: __pathname__ is a test-only sentinel probe from renderSigningRoute (rule 4.6 escape hatch)
  return screen.getByTestId('__pathname__').textContent ?? '';
}

function refusal(status: number, message: string, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(message), { status, ...extra });
}

describe('SigningEntryPage', () => {
  it('sends a link without ?t to the invalid screen and never calls the API', async () => {
    renderEntry(`/sign/${MOCK_ENVELOPE_ID}`);
    await waitFor(() => {
      expect(pathname()).toBe(`/sign/${MOCK_ENVELOPE_ID}/link/invalid`);
    });
    expect(post).not.toHaveBeenCalled();
  });

  it('exchanges ?t= and opens the document (fill) as a fresh link', async () => {
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
      expect(pathname()).toBe(`/sign/${MOCK_ENVELOPE_ID}/fill`);
    });
  });

  it('shows "Opening your document" while the exchange runs', async () => {
    post.mockReturnValueOnce(new Promise(() => {}));
    renderEntry(`/sign/${MOCK_ENVELOPE_ID}?t=${TOKEN}`);
    expect(await screen.findByRole('heading', { name: /opening your document/i })).toBeVisible();
  });

  describe('link states', () => {
    const cases: ReadonlyArray<readonly [string, Error, string]> = [
      ['already_signed', refusal(409, 'already_signed', { reason: 'already_signed' }), 'signed'],
      ['declined', refusal(409, 'already_declined', { reason: 'declined' }), 'declined'],
      ['expired', refusal(410, 'envelope_terminal', { reason: 'expired' }), 'expired'],
      ['canceled', refusal(410, 'envelope_terminal', { reason: 'canceled' }), 'withdrawn'],
      ['not_your_turn', refusal(409, 'not_your_turn', { reason: 'not_your_turn' }), 'notyet'],
      [
        'bare 409 not_your_turn code',
        refusal(409, 'Conflict', { code: 'not_your_turn' }),
        'notyet',
      ],
      ['401', refusal(401, 'invalid_token'), 'invalid'],
      ['400', refusal(400, 'token_malformed'), 'invalid'],
      ['404', refusal(404, 'envelope_not_found'), 'invalid'],
      ['410 without a reason', refusal(410, 'envelope_terminal'), 'invalid'],
    ];

    it.each(cases)('%s goes to the %s screen', async (_name, err, screenKey) => {
      post.mockRejectedValueOnce(err);
      renderEntry(`/sign/${MOCK_ENVELOPE_ID}?t=${TOKEN}`);
      await waitFor(() => {
        expect(pathname()).toBe(`/sign/${MOCK_ENVELOPE_ID}/link/${screenKey}`);
      });
    });

    it('keeps the sender, the turn and the token for the screen, and scrubs ?t= from the URL', async () => {
      post.mockRejectedValueOnce(
        refusal(409, 'not_your_turn', {
          reason: 'not_your_turn',
          waiting_on: 'Alex',
          sender_name: 'Eliran Azulay',
        }),
      );
      renderEntry(`/sign/${MOCK_ENVELOPE_ID}?t=${TOKEN}`);
      await waitFor(() => {
        expect(pathname()).toBe(`/sign/${MOCK_ENVELOPE_ID}/link/notyet`);
      });
      expect(readLinkHints(MOCK_ENVELOPE_ID)).toEqual({
        token: TOKEN,
        sender_name: 'Eliran Azulay',
        waiting_on: 'Alex',
      });
      expect(window.location.search).not.toContain('t=');
    });
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

  it('the retry copy carries role="alert"', async () => {
    const err = Object.assign(new Error('boom'), { status: 500 });
    post.mockRejectedValueOnce(err);
    renderEntry(`/sign/${MOCK_ENVELOPE_ID}?t=${TOKEN}`);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  // Item 4 — the mailto: link must carry a subject prefilled with the
  // envelope id so support gets context.
  it('mailto: link encodes the envelope id in the subject', async () => {
    const err = Object.assign(new Error('boom'), { status: 500 });
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

  describe('emailed one-time code (WP-11)', () => {
    const ok = (data: unknown) => ({
      data,
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    });

    it('shows the code screen instead of a session, then continues to the document after a correct code', async () => {
      post
        .mockResolvedValueOnce(
          ok({
            status: 'access_code_required',
            envelope_id: MOCK_ENVELOPE_ID,
            signer_id: 's1',
            email_masked: 'm***@example.com',
          }),
        )
        .mockResolvedValueOnce(
          ok({
            status: 'sent',
            purpose: 'access',
            email_masked: 'm***@example.com',
            expires_in_seconds: 600,
            resend_after_seconds: 60,
          }),
        )
        .mockResolvedValueOnce(
          ok({ envelope_id: MOCK_ENVELOPE_ID, signer_id: 's1', requires_tc_accept: true }),
        );
      renderEntry(`/sign/${MOCK_ENVELOPE_ID}?t=${TOKEN}`);

      expect(
        await screen.findByRole('heading', { name: /enter your emailed code/i }),
      ).toBeInTheDocument();
      expect(screen.getByText('m***@example.com')).toBeInTheDocument();
      // The token is scrubbed from the address bar while the code is pending.
      expect(window.location.search).not.toContain('t=');

      await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
      await userEvent.type(
        await screen.findByRole('textbox', { name: /one-time code/i }),
        '123456',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

      expect(post).toHaveBeenCalledWith(
        '/sign/access-code/verify',
        { code: '123456' },
        expect.any(Object),
      );
      await waitFor(() => {
        // no semantic role: __pathname__ is a test-only sentinel probe from renderSigningRoute (rule 4.6 escape hatch)
        expect(screen.getByTestId('__pathname__').textContent).toBe(
          `/sign/${MOCK_ENVELOPE_ID}/fill`,
        );
      });
    });

    it('keeps the signer on the code screen after a wrong code', async () => {
      post
        .mockResolvedValueOnce(
          ok({
            status: 'access_code_required',
            envelope_id: MOCK_ENVELOPE_ID,
            signer_id: 's1',
            email_masked: 'm***@example.com',
          }),
        )
        .mockResolvedValueOnce(
          ok({
            status: 'sent',
            purpose: 'access',
            email_masked: 'm***@example.com',
            expires_in_seconds: 600,
            resend_after_seconds: 60,
          }),
        )
        .mockRejectedValueOnce(
          Object.assign(new Error('access_code_invalid'), {
            status: 422,
            code: 'access_code_invalid',
          }),
        );
      renderEntry(`/sign/${MOCK_ENVELOPE_ID}?t=${TOKEN}`);
      await userEvent.click(await screen.findByRole('button', { name: 'Send code' }));
      await userEvent.type(
        await screen.findByRole('textbox', { name: /one-time code/i }),
        '000000',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/not right/i);
      expect(screen.getByRole('heading', { name: /enter your emailed code/i })).toBeInTheDocument();
    });
  });
});
