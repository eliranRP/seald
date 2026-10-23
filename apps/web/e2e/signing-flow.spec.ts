import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Route } from '@playwright/test';

// Real single-page PDF so pdf.js parses + renders the signing canvas.
// The earlier `%PDF-1.4...` stub never parsed and the fill page stayed
// in its loading state, masking signature-chrome regressions.
// `__dirname` is undefined under the ESM playwright runtime — derive it
// from `import.meta.url` (matches guest-flow / template-sign-flow specs).
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SAMPLE_PDF = readFileSync(resolve(__dirname, './fixtures/sample-1page.pdf'));

/**
 * Signing-flow happy path (full coverage).
 *
 * Scope: entry → fill → done — all five navigation
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
    // Cookie-consent banner (T-30) is on every page and would otherwise
    // sit on top of the form during the first navigation in this spec.
    // The hand-written specs don't use the BDD auto-fixture, so opt out
    // explicitly via the runtime escape hatch.
    await page.addInitScript(() => {
      (window as unknown as { __SEALD_CONSENT_DISABLED: boolean }).__SEALD_CONSENT_DISABLED = true;
    });
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

    // T-14: POST /sign/esign-disclosure → records the Consumer Disclosure
    // ack + "demonstrated ability" affirmation. Returns 204-style success.
    await page.route('**/sign/esign-disclosure', async (route: Route) => {
      await route.fulfill({ status: 200, body: '' });
    });

    // T-15: POST /sign/intent-to-sign → records the explicit intent to
    // sign affirmation immediately before submit. Returns 204-style success.
    await page.route('**/sign/intent-to-sign', async (route: Route) => {
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

    // GET /verify/<short_code> → SigningDonePage now polls this endpoint
    // (via useSealedDownload) so the recipient can download the sealed
    // PDF. Without a mock the polling errors out and the Done page
    // renders the failure-fallback alert (no Hero heading).
    await page.route('**/verify/TEST-001', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          envelope: { id: ENVELOPE_ID, short_code: 'TEST-001', status: 'completed' },
          sealed_url: 'https://example.test/sealed.pdf',
          chain_intact: true,
        }),
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
        body: SAMPLE_PDF,
      });
    });
  });

  test('entry → fill (consent, finish) → done happy path', async ({ page }) => {
    // 1. Open the signing link (envelope_id + ?t=<token>).
    await page.goto(`/sign/${ENVELOPE_ID}?t=${TOKEN}`);

    // 2. Entry page exchanges the token and opens the document, where the
    //    consent bar waits.
    await page.waitForURL(`**/sign/${ENVELOPE_ID}/fill`, { timeout: 15_000 });
    await expect(page.getByText('Test Document').first()).toBeVisible();

    // 3. One checkbox, then Start: fires POST /sign/accept-terms +
    //    POST /sign/esign-disclosure (both mocked above). Start stays
    //    disabled until the box is ticked.
    const start = page.getByRole('button', { name: /^start$/i });
    await expect(start).toBeDisabled();
    await page.getByRole('checkbox', { name: /agree to sign electronically/i }).check();
    await start.click();

    // 4. The pre-filled required field means the bar shows Finish at once.
    //    Finish opens the intent-to-sign sheet; Sign submits.
    await page.getByRole('button', { name: /^finish$/i }).click();
    const sheet = page.getByRole('dialog', { name: /finish signing/i });
    await expect(sheet.getByText(/you intend to sign this document electronically/i)).toBeVisible();
    await sheet.getByRole('button', { name: /^sign$/i }).click();

    // 5. Land on /done. The heading records this signature. The sealed
    //    PDF is downloadable after everyone has signed.
    await page.waitForURL(`**/sign/${ENVELOPE_ID}/done`, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /^signed$/i })).toBeVisible();
  });
});
