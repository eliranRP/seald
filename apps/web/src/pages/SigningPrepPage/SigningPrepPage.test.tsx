import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderSigningRoute } from '../../test/renderSigningRoute';
import {
  MOCK_ENVELOPE_ID,
  createSigningApiMock,
  makeSignMeResponse,
} from '../../test/signingApiMock';

vi.mock('../../lib/api/signApiClient', () => createSigningApiMock());

// eslint-disable-next-line import/first
import { signApiClient } from '../../lib/api/signApiClient';
// eslint-disable-next-line import/first
import { SigningPrepPage } from './SigningPrepPage';

const get = signApiClient.get as unknown as ReturnType<typeof vi.fn>;
const post = signApiClient.post as unknown as ReturnType<typeof vi.fn>;

function renderPrep() {
  return renderSigningRoute(<SigningPrepPage />, {
    initialEntry: `/sign/${MOCK_ENVELOPE_ID}/prep`,
    path: '/sign/:envelopeId/prep',
  });
}

function okResponse<T>(data: T, status = 200) {
  return { data, status, statusText: 'OK', headers: {}, config: {} };
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  // Default: happy path — /sign/me resolves with a fresh signer.
  get.mockResolvedValue(okResponse(makeSignMeResponse()));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(window, 'confirm').mockRestore?.();
});

describe('SigningPrepPage', () => {
  it('renders signer identity card with name + email', async () => {
    renderPrep();
    expect(await screen.findByText('Maya Raskin')).toBeInTheDocument();
    expect(screen.getByText('maya@example.com')).toBeInTheDocument();
  });

  it('links the Consumer Disclosure copy to /legal/esign-disclosure', async () => {
    renderPrep();
    const link = await screen.findByRole('link', { name: /consumer disclosure/i });
    expect(link).toHaveAttribute('href', '/legal/esign-disclosure');
  });

  it('Start signing is disabled until BOTH ESIGN checkboxes are ticked', async () => {
    renderPrep();
    const start = await screen.findByRole('button', { name: /start signing/i });
    expect(start).toBeDisabled();
    const consent = screen.getByRole('checkbox', { name: /read the consumer disclosure/i });
    await userEvent.click(consent);
    // Only one of two checked — still disabled (T-14 requires both).
    expect(start).toBeDisabled();
    const access = screen.getByRole('checkbox', {
      name: /access electronic records on this device/i,
    });
    await userEvent.click(access);
    expect(start).not.toBeDisabled();
  });

  it('clicking Start calls acceptTerms + esign-disclosure and navigates to /fill', async () => {
    // Two POSTs expected: /sign/accept-terms and /sign/esign-disclosure.
    post.mockResolvedValue(okResponse(null, 204));
    renderPrep();
    await userEvent.click(
      await screen.findByRole('checkbox', { name: /read the consumer disclosure/i }),
    );
    await userEvent.click(
      screen.getByRole('checkbox', { name: /access electronic records on this device/i }),
    );
    await userEvent.click(screen.getByRole('button', { name: /start signing/i }));
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/sign/accept-terms', undefined, expect.any(Object));
    });
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/sign/esign-disclosure',
        { disclosure_version: 'esign_v0.1' },
        expect.any(Object),
      );
    });
    await waitFor(() => {
      // no semantic role: __pathname__ is a test-only sentinel probe from renderSigningRoute (rule 4.6 escape hatch)
      expect(screen.getByTestId('__pathname__').textContent).toBe(`/sign/${MOCK_ENVELOPE_ID}/fill`);
    });
  });

  it('skips acceptTerms when tc_accepted_at is already set, but still records esign-disclosure', async () => {
    get.mockResolvedValueOnce(
      okResponse(
        makeSignMeResponse({
          signer: {
            ...makeSignMeResponse().signer,
            tc_accepted_at: '2026-04-24T00:00:00Z',
          },
        }),
      ),
    );
    post.mockResolvedValue(okResponse(null, 204));
    renderPrep();
    await userEvent.click(
      await screen.findByRole('checkbox', { name: /read the consumer disclosure/i }),
    );
    await userEvent.click(
      screen.getByRole('checkbox', { name: /access electronic records on this device/i }),
    );
    await userEvent.click(screen.getByRole('button', { name: /start signing/i }));
    await waitFor(() => {
      expect(screen.getByTestId('__pathname__').textContent).toBe(`/sign/${MOCK_ENVELOPE_ID}/fill`);
    });
    // acceptTerms was skipped; esign-disclosure was still POSTed (T-14).
    expect(post).not.toHaveBeenCalledWith(
      '/sign/accept-terms',
      expect.anything(),
      expect.anything(),
    );
    expect(post).toHaveBeenCalledWith(
      '/sign/esign-disclosure',
      { disclosure_version: 'esign_v0.1' },
      expect.any(Object),
    );
  });

  it('confirm+decline navigates to /declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    post.mockResolvedValueOnce(okResponse({ status: 'declined', envelope_status: 'declined' }));
    renderPrep();
    await userEvent.click(await screen.findByRole('button', { name: /decline this request/i }));
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/sign/decline',
        { reason: 'declined-on-prep' },
        expect.any(Object),
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('__pathname__').textContent).toBe(
        `/sign/${MOCK_ENVELOPE_ID}/declined`,
      );
    });
  });

  it('cancelled confirm does not call decline', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPrep();
    await userEvent.click(await screen.findByRole('button', { name: /decline this request/i }));
    expect(post).not.toHaveBeenCalled();
  });

  it('Start path 401 from acceptTerms re-routes back to /sign/:envelopeId', async () => {
    // Token-expired during the acceptTerms POST: the prep page should
    // bounce back to the entry route so the signer can re-validate the
    // link. This covers SigningPrepPage handleStart's 401/410 branch.
    const expired = Object.assign(new Error('expired'), { status: 401 });
    post.mockRejectedValueOnce(expired);
    renderPrep();
    await userEvent.click(
      await screen.findByRole('checkbox', { name: /read the consumer disclosure/i }),
    );
    await userEvent.click(
      screen.getByRole('checkbox', { name: /access electronic records on this device/i }),
    );
    await userEvent.click(screen.getByRole('button', { name: /start signing/i }));
    await waitFor(() => {
      expect(screen.getByTestId('__pathname__').textContent).toBe(`/sign/${MOCK_ENVELOPE_ID}`);
    });
    // No alert banner should render — we navigated, not surfaced an error.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('Start path 410 (revoked) also re-routes back to /sign/:envelopeId', async () => {
    const revoked = Object.assign(new Error('gone'), { status: 410 });
    post.mockRejectedValueOnce(revoked);
    renderPrep();
    await userEvent.click(
      await screen.findByRole('checkbox', { name: /read the consumer disclosure/i }),
    );
    await userEvent.click(
      screen.getByRole('checkbox', { name: /access electronic records on this device/i }),
    );
    await userEvent.click(screen.getByRole('button', { name: /start signing/i }));
    await waitFor(() => {
      expect(screen.getByTestId('__pathname__').textContent).toBe(`/sign/${MOCK_ENVELOPE_ID}`);
    });
  });

  it('Start path 5xx surfaces a recoverable error in role=alert and re-enables the button', async () => {
    // Generic API failure during acceptTerms — the page must keep the
    // signer on /prep, surface the message, and let them retry. The
    // Start button must re-enable so retry is possible.
    const boom = Object.assign(new Error('upstream is on fire'), { status: 500 });
    post.mockRejectedValueOnce(boom);
    renderPrep();
    await userEvent.click(
      await screen.findByRole('checkbox', { name: /read the consumer disclosure/i }),
    );
    await userEvent.click(
      screen.getByRole('checkbox', { name: /access electronic records on this device/i }),
    );
    const start = screen.getByRole('button', { name: /start signing/i });
    await userEvent.click(start);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/upstream is on fire/i);
    // The button must be re-enabled so the user can retry.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start signing/i })).not.toBeDisabled();
    });
  });

  it('Start path with no message uses a generic fallback error string', async () => {
    // ApiErrorLike with `message` undefined is unusual but possible; the
    // prep page falls back to a recovery hint. Covers the default branch
    // of `e.message ?? "We could not record …"`.
    const blank: { status: number; message?: string } = { status: 500 };
    post.mockRejectedValueOnce(blank);
    renderPrep();
    await userEvent.click(
      await screen.findByRole('checkbox', { name: /read the consumer disclosure/i }),
    );
    await userEvent.click(
      screen.getByRole('checkbox', { name: /access electronic records on this device/i }),
    );
    await userEvent.click(screen.getByRole('button', { name: /start signing/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not record your acceptance/i);
  });

  it('NotMe button confirms first, then POSTs decline with reason "not-the-recipient" and routes to /declined', async () => {
    // BUG FIX: "Not me?" was previously a one-tap destructive action with
    // no confirmation. On mobile the small target near the avatar made
    // accidental decline trivial. We now require confirmation before
    // sending the audit-logged decline.
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    post.mockResolvedValueOnce(okResponse({ status: 'declined', envelope_status: 'declined' }));
    renderPrep();
    await userEvent.click(await screen.findByRole('button', { name: /not me\?/i }));
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/sign/decline',
        { reason: 'not-the-recipient' },
        expect.any(Object),
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('__pathname__').textContent).toBe(
        `/sign/${MOCK_ENVELOPE_ID}/declined`,
      );
    });
  });

  it('NotMe button cancelled at confirm does NOT POST and stays on /prep', async () => {
    // BUG FIX (regression): tapping Not me by accident must be undoable
    // via the native confirm dialog before any audit event lands.
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPrep();
    await userEvent.click(await screen.findByRole('button', { name: /not me\?/i }));
    expect(post).not.toHaveBeenCalled();
    expect(screen.queryByTestId('__pathname__')).toBeNull();
  });

  it('NotMe button swallows API failure and re-enables the rest of the UI', async () => {
    // The intentionally-quiet handleNotMe `catch {}` branch — failure
    // unsticks `busy` so the signer can still decline/withdraw normally.
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    post.mockRejectedValueOnce(new Error('network down'));
    renderPrep();
    await userEvent.click(await screen.findByRole('button', { name: /not me\?/i }));
    // Decline button must end up enabled again (busy=false on catch).
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /decline this request/i })).not.toBeDisabled();
    });
  });

  it('Decline path surfaces the API error message in a role=alert when the call fails', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    post.mockRejectedValueOnce(Object.assign(new Error('cannot decline now'), { status: 500 }));
    renderPrep();
    await userEvent.click(await screen.findByRole('button', { name: /decline this request/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/cannot decline now/i);
    // Decline button is re-enabled on failure so the user can retry.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /decline this request/i })).not.toBeDisabled();
    });
  });

  it('Decline path falls back to a generic error string when `message` is missing', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    post.mockRejectedValueOnce({ status: 500 });
    renderPrep();
    await userEvent.click(await screen.findByRole('button', { name: /decline this request/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not decline right now/i);
  });

  it('Withdraw consent confirms, POSTs /sign/withdraw-consent, and routes to /declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    post.mockResolvedValueOnce(
      okResponse({ status: 'consent_withdrawn', envelope_status: 'declined' }),
    );
    renderPrep();
    await userEvent.click(
      await screen.findByRole('button', { name: /withdraw consent to sign electronically/i }),
    );
    await waitFor(() => {
      // signApiClient.post(url, body, axiosConfig) — withdrawConsent
      // calls it with no body so the second arg is `undefined`. The third
      // arg is the axios config (always an object even when empty).
      expect(post).toHaveBeenCalledWith('/sign/withdraw-consent', undefined, expect.any(Object));
    });
    await waitFor(() => {
      expect(screen.getByTestId('__pathname__').textContent).toBe(
        `/sign/${MOCK_ENVELOPE_ID}/declined`,
      );
    });
  });

  it('Withdraw consent: cancelled confirm does not POST anything', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPrep();
    await userEvent.click(
      await screen.findByRole('button', { name: /withdraw consent to sign electronically/i }),
    );
    expect(post).not.toHaveBeenCalled();
  });

  it('Withdraw consent surfaces the API error message and re-enables the button on failure', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    post.mockRejectedValueOnce(Object.assign(new Error('withdraw blew up'), { status: 500 }));
    renderPrep();
    await userEvent.click(
      await screen.findByRole('button', { name: /withdraw consent to sign electronically/i }),
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/withdraw blew up/i);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /withdraw consent to sign electronically/i }),
      ).not.toBeDisabled();
    });
  });

  it('Withdraw consent falls back to a generic error string when `message` is missing', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    post.mockRejectedValueOnce({ status: 500 });
    renderPrep();
    await userEvent.click(
      await screen.findByRole('button', { name: /withdraw consent to sign electronically/i }),
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not record your withdrawal/i);
  });

  it('renders nothing while the session is still loading (envelope+signer null)', async () => {
    // Slow GET: keep /sign/me pending so the provider's envelope is
    // still null when we assert. The Content component's
    // `if (!envelope || !signer) return null` branch is exercised.
    let resolveGet: (value: unknown) => void = () => {};
    get.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveGet = resolve;
      }),
    );
    renderPrep();
    // No sign-in CTA, no name, no skeleton — the page renders nothing
    // until the session hydrates. The pathname probe stays on /prep.
    expect(screen.queryByRole('button', { name: /start signing/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Maya Raskin')).not.toBeInTheDocument();
    // Resolve so afterEach can clean up React act() warnings.
    resolveGet(okResponse(makeSignMeResponse()));
    await waitFor(() => expect(screen.getByText('Maya Raskin')).toBeInTheDocument());
  });
});
