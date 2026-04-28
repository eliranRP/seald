import { test, expect, type Route } from '@playwright/test';

/**
 * Signing-flow happy path (full coverage).
 *
 * Scope: entry → prep → fill → review → done — all five navigation
 * checkpoints with their backing /sign/* mocks. The fill page is the
 * load-bearing one: instead of driving PDF.js + the signature canvas
 * (which would flake), we seed `/sign/me` with a single required text
 * field that's already filled. That makes `allRequiredFilled` true on
 * first render so the "Review & finish" button appears immediately and
 * we can move on without touching the document canvas.
 *
 * All `/sign/*` calls are intercepted via `page.route` — no backend.
 *
 * Rule 11.3 — module-level fixtures are wrapped in factory functions
 * so each spec gets a fresh object (no shared mutable state).
 */

const ENVELOPE_ID = 'env-test-001';
// 43-char URL-safe token mirroring the real /sign-link tokens.
const TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const SIGNER_ID = 'signer-test-001';
const FIELD_ID = 'field-text-001';

function makeBaseEnvelope() {
  return {
    id: ENVELOPE_ID,
    title: 'Test Document',
    short_code: 'TEST-001',
    status: 'sent',
    original_pages: 1,
    expires_at: '2099-12-31T00:00:00.000Z',
    tc_version: 'v1',
    privacy_version: 'v1',
  };
}

function makeBaseSigner() {
  return {
    id: SIGNER_ID,
    email: 'signer@example.com',
    name: 'Test Signer',
    color: '#4f46e5',
    role: 'signatory' as const,
    status: 'viewing' as const,
    viewed_at: null,
    tc_accepted_at: null,
    signed_at: null,
    declined_at: null,
  };
}

function makeFilledTextField() {
  // Pre-filled so `allRequiredFilled` flips true on first render and the
  // fill page exposes the "Review & finish" CTA without us having to
  // drive the field drawer / signature canvas.
  return {
    id: FIELD_ID,
    signer_id: SIGNER_ID,
    kind: 'text' as const,
    page: 1,
    x: 0.1,
    y: 0.2,
    width: 0.3,
    height: 0.05,
    required: true,
    value_text: 'Pre-filled answer',
    filled_at: '2026-04-25T10:00:00.000Z',
  };
}

test.describe('signing flow', () => {
  test.beforeEach(async ({ page }) => {
    // POST /sign/start → a session that still requires T&C accept.
    await page.route('**/sign/start', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          envelope_id: ENVELOPE_ID,
          signer_id: SIGNER_ID,
          requires_tc_accept: true,
        }),
      });
    });

    // GET /sign/me → envelope + signer + a single pre-filled required
    // text field, so the fill page renders the "Review & finish" CTA on
    // first paint (allRequiredFilled becomes true).
    await page.route('**/sign/me', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          envelope: makeBaseEnvelope(),
          signer: makeBaseSigner(),
          fields: [makeFilledTextField()],
          other_signers: [],
        }),
      });
    });

    // POST /sign/accept-terms → empty 204-style success.
    await page.route('**/sign/accept-terms', async (route: Route) => {
      await route.fulfill({ status: 200, body: '' });
    });

    // POST /sign/fields/:id → echo back the field as filled. Not strictly
    // needed when we pre-fill in /sign/me, but mocked here so any drawer
    // interaction during the spec doesn't leak to a real backend.
    await page.route('**/sign/fields/*', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeFilledTextField()),
      });
    });

    // POST /sign/signature → returns the updated signer.
    await page.route('**/sign/signature', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeBaseSigner()),
      });
    });

    // POST /sign/submit → success. The submit mutation's onSuccess writes
    // the doneSnapshot to sessionStorage; the Done page reads from there.
    await page.route('**/sign/submit', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'submitted', envelope_status: 'completed' }),
      });
    });

    // GET /sign/pdf → tiny inline fixture so pdf.js doesn't 404 on the
    // fill page. Content is intentionally minimal; the fill page renders
    // even if rasterization fails.
    await page.route('**/sign/pdf', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: '/pdf-fixture.pdf' }),
      });
    });
    await page.route('**/pdf-fixture.pdf', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF',
      });
    });
  });

  test('entry → prep → fill → review → done happy path', async ({ page }) => {
    // 1. Open the signing link (envelope_id + ?t=<token>).
    await page.goto(`/sign/${ENVELOPE_ID}?t=${TOKEN}`);

    // 2. Entry page exchanges the token, then redirects to /prep because
    //    the mocked /sign/start returned requires_tc_accept: true.
    await page.waitForURL(`**/sign/${ENVELOPE_ID}/prep`, { timeout: 15_000 });

    // 3. Prep page shows the document title (in the banner header AND
    //    the hero copy — first() collapses the strict-mode multi-match).
    await expect(page.getByText('Test Document').first()).toBeVisible();

    // 4. Tick the "I agree to electronic signatures" checkbox.
    await page.getByRole('checkbox', { name: /agree to electronic signatures/i }).check();

    // 5. Click "Start signing" — fires POST /sign/accept-terms (mocked
    //    above) and navigates to /fill.
    await page.getByRole('button', { name: /start signing/i }).click();
    await page.waitForURL(`**/sign/${ENVELOPE_ID}/fill`, { timeout: 15_000 });

    // 6. The pre-filled required field flips `allRequiredFilled = true`,
    //    so the action bar shows "Review & finish" immediately. Click it.
    await page.getByRole('button', { name: /review (?:&|and) finish/i }).click();
    await page.waitForURL(`**/sign/${ENVELOPE_ID}/review`, { timeout: 15_000 });

    // 7. Review page heading + submit button.
    await expect(page.getByRole('heading', { name: /everything look right\?/i })).toBeVisible();
    await page.getByRole('button', { name: /sign and submit/i }).click();

    // 8. Land on /done and assert the success heading.
    await page.waitForURL(`**/sign/${ENVELOPE_ID}/done`, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /^seald\.?$/i })).toBeVisible();
  });
});
