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
    // Item 5 — Decline is nested inside the "Need to opt out?" expandable.
    await userEvent.click(await screen.findByRole('button', { name: /need to opt out/i }));
    await userEvent.click(screen.getByRole('button', { name: /decline this request/i }));
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
    await userEvent.click(await screen.findByRole('button', { name: /need to opt out/i }));
    await userEvent.click(screen.getByRole('button', { name: /decline this request/i }));
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

  it('"Wrong recipient?" confirms first, then POSTs decline with reason "not-the-recipient" and routes to /declined', async () => {
    // BUG FIX: "Not me?" was previously a one-tap destructive action with
    // no confirmation. Item 5 renames it to "Wrong recipient?" and tucks
    // it into the opt-out expandable group so accidental decline is even
    // less likely.
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    post.mockResolvedValueOnce(okResponse({ status: 'declined', envelope_status: 'declined' }));
    renderPrep();
    await userEvent.click(await screen.findByRole('button', { name: /need to opt out/i }));
    await userEvent.click(screen.getByRole('button', { name: /wrong recipient/i }));
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

  it('"Wrong recipient?" cancelled at confirm does NOT POST and stays on /prep', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPrep();
    await userEvent.click(await screen.findByRole('button', { name: /need to opt out/i }));
    await userEvent.click(screen.getByRole('button', { name: /wrong recipient/i }));
    expect(post).not.toHaveBeenCalled();
    expect(screen.queryByTestId('__pathname__')).toBeNull();
  });

  it('"Wrong recipient?" swallows API failure and re-enables the rest of the UI', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    post.mockRejectedValueOnce(new Error('network down'));
    renderPrep();
    await userEvent.click(await screen.findByRole('button', { name: /need to opt out/i }));
    await userEvent.click(screen.getByRole('button', { name: /wrong recipient/i }));
    // Decline button must end up enabled again (busy=false on catch).
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /decline this request/i })).not.toBeDisabled();
    });
  });

  it('Decline path surfaces the API error message in a role=alert when the call fails', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    post.mockRejectedValueOnce(Object.assign(new Error('cannot decline now'), { status: 500 }));
    renderPrep();
    await userEvent.click(await screen.findByRole('button', { name: /need to opt out/i }));
    await userEvent.click(screen.getByRole('button', { name: /decline this request/i }));
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
    await userEvent.click(await screen.findByRole('button', { name: /need to opt out/i }));
    await userEvent.click(screen.getByRole('button', { name: /decline this request/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not decline right now/i);
  });

  it('Withdraw consent: confirming the styled dialog POSTs /sign/withdraw-consent and routes to /declined', async () => {
    // Item 7 (regression) — the page used to call window.confirm here; it
    // now opens a styled <Dialog> instead. Open the opt-out group (item 5),
    // click "Withdraw consent…" to mount the dialog, then click the
    // dialog's confirm button.
    post.mockResolvedValueOnce(
      okResponse({ status: 'consent_withdrawn', envelope_status: 'declined' }),
    );
    renderPrep();
    await userEvent.click(await screen.findByRole('button', { name: /need to opt out/i }));
    await userEvent.click(
      screen.getByRole('button', { name: /withdraw consent to sign electronically/i }),
    );
    await userEvent.click(screen.getByRole('button', { name: /^withdraw consent$/i }));
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

  it('Withdraw consent: dismissing the dialog does not POST anything', async () => {
    renderPrep();
    await userEvent.click(await screen.findByRole('button', { name: /need to opt out/i }));
    await userEvent.click(
      screen.getByRole('button', { name: /withdraw consent to sign electronically/i }),
    );
    // Cancel the styled dialog (button accessible name = "Keep signing").
    await userEvent.click(screen.getByRole('button', { name: /keep signing/i }));
    expect(post).not.toHaveBeenCalled();
  });

  it('Withdraw consent surfaces the API error message and re-enables the trigger on failure', async () => {
    post.mockRejectedValueOnce(Object.assign(new Error('withdraw blew up'), { status: 500 }));
    renderPrep();
    await userEvent.click(await screen.findByRole('button', { name: /need to opt out/i }));
    await userEvent.click(
      screen.getByRole('button', { name: /withdraw consent to sign electronically/i }),
    );
    await userEvent.click(screen.getByRole('button', { name: /^withdraw consent$/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/withdraw blew up/i);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /withdraw consent to sign electronically/i }),
      ).not.toBeDisabled();
    });
  });

  it('Withdraw consent falls back to a generic error string when `message` is missing', async () => {
    post.mockRejectedValueOnce({ status: 500 });
    renderPrep();
    await userEvent.click(await screen.findByRole('button', { name: /need to opt out/i }));
    await userEvent.click(
      screen.getByRole('button', { name: /withdraw consent to sign electronically/i }),
    );
    await userEvent.click(screen.getByRole('button', { name: /^withdraw consent$/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not record your withdrawal/i);
  });

  // Item 5 — the three destructive opt-out controls (Wrong recipient? /
  // Decline / Withdraw consent) used to be three top-level buttons stacked
  // below "Start signing", which made misclicks easy. They are now nested
  // inside a single subdued "Need to opt out?" <details> expandable group.
  it('groups opt-out actions inside a single expandable "Need to opt out?" region', async () => {
    renderPrep();
    // The opt-out trigger renders as a button (the <summary>) that toggles
    // a <details> element; query by accessible name (rule 4.6).
    const trigger = await screen.findByRole('button', { name: /need to opt out/i });
    expect(trigger).toBeInTheDocument();
    // The three opt-out controls live INSIDE the same <details> parent —
    // confirming the single-region grouping. Walk up from each control to
    // the closest <details> and assert all three share the same ancestor.
    const wrong = screen.getByRole('button', { name: /wrong recipient/i });
    const decline = screen.getByRole('button', { name: /decline this request/i });
    const withdraw = screen.getByRole('button', {
      name: /withdraw consent to sign electronically/i,
    });
    const details = wrong.closest('details');
    expect(details).not.toBeNull();
    expect(decline.closest('details')).toBe(details);
    expect(withdraw.closest('details')).toBe(details);
  });

  // Item 6 — the disclosure checkboxes had no explicit :focus-visible style
  // and relied on the global 2px outline that is barely visible at 18×18.
  // The styled-component now ships an explicit box-shadow rule.
  it('Checkbox carries an explicit :focus-visible box-shadow rule', async () => {
    renderPrep();
    const consent = await screen.findByRole('checkbox', {
      name: /read the consumer disclosure/i,
    });
    // styled-components inlines the rule under the generated class. We
    // assert the rule exists in the document's stylesheets — exact
    // computed value is brittle across jsdom versions so we look for the
    // class on the element AND the rule in any stylesheet.
    expect(consent.className).toBeTruthy();
    const sheets = Array.from(document.styleSheets) as CSSStyleSheet[];
    const haveFocusRule = sheets.some((sheet) => {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        return false;
      }
      return Array.from(rules).some((rule) => {
        const text = rule.cssText ?? '';
        return /focus-visible/.test(text) && /box-shadow/.test(text);
      });
    });
    expect(haveFocusRule).toBe(true);
  });

  // Item 7 — withdraw consent moved from window.confirm to a styled
  // <Dialog> that surfaces the audit-trail event name. The mocked
  // window.confirm must NOT be called; instead a dialog mounts and a
  // primary action inside it performs the POST.
  it('Withdraw consent opens a styled dialog (not window.confirm) and confirming POSTs the audit-logged endpoint', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    post.mockResolvedValueOnce(
      okResponse({ status: 'consent_withdrawn', envelope_status: 'declined' }),
    );
    renderPrep();
    // Open the opt-out group first.
    await userEvent.click(await screen.findByRole('button', { name: /need to opt out/i }));
    await userEvent.click(
      screen.getByRole('button', { name: /withdraw consent to sign electronically/i }),
    );
    // window.confirm must NOT be invoked (issue 7 — replace native dialog).
    expect(confirmSpy).not.toHaveBeenCalled();
    // The styled dialog mounts as role="dialog".
    const dialog = await screen.findByRole('dialog', { name: /withdraw consent/i });
    expect(dialog).toBeInTheDocument();
    // Audit-event name (`consent_withdrawn`) is surfaced inside the dialog.
    expect(dialog).toHaveTextContent(/consent_withdrawn/);
    // Confirm inside the dialog performs the POST.
    await userEvent.click(screen.getByRole('button', { name: /^withdraw consent$/i }));
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/sign/withdraw-consent', undefined, expect.any(Object));
    });
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
