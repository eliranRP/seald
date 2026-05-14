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
import { SigningReviewPage } from './SigningReviewPage';

const get = signApiClient.get as unknown as ReturnType<typeof vi.fn>;
const post = signApiClient.post as unknown as ReturnType<typeof vi.fn>;

function okResponse<T>(data: T, status = 200) {
  return { data, status, statusText: 'OK', headers: {}, config: {} };
}

function renderReview() {
  return renderSigningRoute(<SigningReviewPage />, {
    initialEntry: `/sign/${MOCK_ENVELOPE_ID}/review`,
    path: '/sign/:envelopeId/review',
  });
}

// Seed every field as filled so the review list renders rows.
const FILLED_ME = makeSignMeResponse({
  fields: [
    {
      id: 'f-text',
      signer_id: 'signer-test-001',
      kind: 'text',
      page: 1,
      x: 60,
      y: 300,
      required: true,
      value_text: 'Engineer',
      filled_at: '2026-04-24T00:00:00Z',
    },
    {
      id: 'f-sig',
      signer_id: 'signer-test-001',
      kind: 'signature',
      page: 2,
      x: 60,
      y: 560,
      required: true,
      value_text: 'Maya Raskin',
      filled_at: '2026-04-24T00:00:00Z',
    },
  ],
});

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  get.mockResolvedValue(okResponse(FILLED_ME));
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SigningReviewPage', () => {
  it('renders one row per filled field', async () => {
    const { container } = renderReview();
    await screen.findByText(/everything look right/i);
    // Rows tag themselves with data-testid from the ReviewList component.
    await waitFor(() => {
      expect(container.querySelectorAll('[data-testid^="review-row-"]')).toHaveLength(2);
    });
  });

  it('Back navigates to /fill', async () => {
    renderReview();
    await userEvent.click(await screen.findByRole('button', { name: /back to fields/i }));
    await waitFor(() => {
      // no semantic role: __pathname__ is a test-only sentinel probe from renderSigningRoute (rule 4.6 escape hatch)
      expect(screen.getByTestId('__pathname__').textContent).toBe(`/sign/${MOCK_ENVELOPE_ID}/fill`);
    });
  });

  it('Sign-and-submit calls /sign/intent-to-sign + /sign/submit and navigates to /done', async () => {
    // Two POSTs in order: /sign/intent-to-sign (T-15) then /sign/submit.
    post
      .mockResolvedValueOnce(okResponse(null, 204))
      .mockResolvedValueOnce(okResponse({ status: 'submitted', envelope_status: 'sealing' }));
    renderReview();
    await userEvent.click(
      await screen.findByRole('checkbox', { name: /intend to sign this document/i }),
    );
    await userEvent.click(screen.getByRole('button', { name: /sign and submit/i }));
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/sign/intent-to-sign', undefined, expect.any(Object));
    });
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/sign/submit', undefined, expect.any(Object));
    });
    await waitFor(() => {
      expect(screen.getByTestId('__pathname__').textContent).toBe(`/sign/${MOCK_ENVELOPE_ID}/done`);
    });
  });

  it('401 on submit redirects the user back to /sign/:id', async () => {
    // Intent-to-sign succeeds, then /sign/submit returns 401.
    post
      .mockResolvedValueOnce(okResponse(null, 204))
      .mockRejectedValueOnce(Object.assign(new Error('session_expired'), { status: 401 }));
    renderReview();
    await userEvent.click(
      await screen.findByRole('checkbox', { name: /intend to sign this document/i }),
    );
    await userEvent.click(screen.getByRole('button', { name: /sign and submit/i }));
    await waitFor(() => {
      expect(screen.getByTestId('__pathname__').textContent).toBe(`/sign/${MOCK_ENVELOPE_ID}`);
    });
  });

  it('generic submit error shows an inline alert banner', async () => {
    post
      .mockResolvedValueOnce(okResponse(null, 204))
      .mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }));
    renderReview();
    await userEvent.click(
      await screen.findByRole('checkbox', { name: /intend to sign this document/i }),
    );
    await userEvent.click(screen.getByRole('button', { name: /sign and submit/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/boom/i);
  });

  describe('Withdraw consent (issue #41)', () => {
    afterEach(() => {
      vi.spyOn(window, 'confirm').mockRestore?.();
    });

    it('renders a Withdraw consent control on the review screen', async () => {
      renderReview();
      const btn = await screen.findByRole('button', {
        name: /withdraw consent to sign electronically/i,
      });
      expect(btn).toBeInTheDocument();
    });

    it('confirm + click POSTs /sign/withdraw-consent and routes to /declined', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      post.mockResolvedValueOnce(
        okResponse({ status: 'consent_withdrawn', envelope_status: 'declined' }),
      );
      renderReview();
      const btn = await screen.findByRole('button', {
        name: /withdraw consent to sign electronically/i,
      });
      await userEvent.click(btn);
      await waitFor(() => {
        expect(post).toHaveBeenCalledWith('/sign/withdraw-consent', undefined, expect.any(Object));
      });
      await waitFor(() => {
        // no semantic role: __pathname__ is a test-only sentinel probe (rule 4.6)
        expect(screen.getByTestId('__pathname__').textContent).toBe(
          `/sign/${MOCK_ENVELOPE_ID}/declined`,
        );
      });
    });

    it('cancelled confirm does not call the withdraw endpoint', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      renderReview();
      const btn = await screen.findByRole('button', {
        name: /withdraw consent to sign electronically/i,
      });
      await userEvent.click(btn);
      expect(post).not.toHaveBeenCalled();
    });
  });

  // Item 11 — each row now exposes an "Edit" affordance that pops the
  // FieldInputDrawer (text/email/date/name) or SignatureCapture
  // (signature/initials) inline within the review page.
  it('per-row Edit on a text field opens the FieldInputDrawer inline', async () => {
    renderReview();
    await screen.findByText(/everything look right/i);
    // Edit buttons carry aria-label="Edit <label>" — query by the leading
    // word so we match every row independent of label.
    const editButtons = await screen.findAllByRole('button', { name: /^edit\b/i });
    expect(editButtons.length).toBeGreaterThanOrEqual(1);
    await userEvent.click(editButtons[0]!);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
  });

  it('per-row Edit on a signature field opens the SignatureCapture sheet inline', async () => {
    renderReview();
    await screen.findByText(/everything look right/i);
    const editButtons = await screen.findAllByRole('button', { name: /^edit\b/i });
    // Second row is the signature field — opening it should mount the
    // SignatureCapture sheet. The sheet renders a role="tablist" of
    // drawn / typed / upload tabs so we assert on that.
    await userEvent.click(editButtons[1]!);
    expect(await screen.findByRole('tab', { name: /drawn|typed|upload/i })).toBeInTheDocument();
  });

  // Item 12 — Save as template leaked sender functionality into the signer
  // flow. The button must NOT be rendered (the underlying TODO(api) stub
  // is removed alongside it).
  it('does not render a "Save as template" affordance', async () => {
    renderReview();
    await screen.findByText(/everything look right/i);
    expect(screen.queryByRole('button', { name: /save as template/i })).toBeNull();
  });

  // Item 13 — IntentCheckbox now ships an explicit :focus-visible rule
  // mirroring the prep-page Checkbox fix.
  it('IntentCheckbox carries an explicit :focus-visible box-shadow rule', async () => {
    renderReview();
    const intent = await screen.findByRole('checkbox', {
      name: /intend to sign this document/i,
    });
    expect(intent.className).toBeTruthy();
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

  // Item 14 — Legal copy now acknowledges both controls (the checkbox AND
  // the submit click) so the dual-affirmation narrative is reflected.
  it('Legal copy acknowledges both the checkbox AND the submit click', async () => {
    renderReview();
    // The copy is split across <b> tags ("...below AND clicking Sign and
    // submit..."), so use the document's flat textContent as the
    // assertion surface. The <Legal> block lives inside <Inner>; we
    // assert via `body.textContent` to keep the test resilient to
    // intermediate wrapper changes.
    await screen.findByText(/everything look right/i);
    const flat = (document.body.textContent ?? '').replace(/\s+/g, ' ').toLowerCase();
    expect(flat).toMatch(/checking the box below and clicking sign and submit/);
    expect(flat).toMatch(/legal equivalent of your handwritten signature/);
  });

  // Item 16 — Helper copy was "lock the document and send a signed copy" —
  // softened/clarified to "seal the document and email a signed copy to
  // everyone."
  it('uses the updated helper copy ("seal the document … email a signed copy")', async () => {
    renderReview();
    const helper = await screen.findByText(
      /seal the document and email a signed copy to everyone/i,
    );
    expect(helper).toBeInTheDocument();
  });
});
