import { test, expect, type Route } from '@playwright/test';

/**
 * Signing-flow happy path (first iteration).
 *
 * Scope: entry → prep → fill navigation, plus the T&C accept POST.
 *
 * The fill / review / done steps require mocking PDF rendering, the
 * signature-capture drawer, and writing the sessionStorage handoff that
 * `SigningDonePage` reads to render its terminal screen. That's tracked
 * as a TODO below; a 3-step happy path that passes consistently is more
 * valuable than a 6-step one that flakes on PDF.js timing.
 *
 * All `/sign/*` calls are intercepted via `page.route` — no backend.
 */

const ENVELOPE_ID = 'env-test-001';
// 43-char URL-safe token mirroring the real /sign-link tokens.
const TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const SIGNER_ID = 'signer-test-001';

const baseEnvelope = {
  id: ENVELOPE_ID,
  title: 'Test Document',
  short_code: 'TEST-001',
  status: 'sent',
  original_pages: 1,
  expires_at: '2099-12-31T00:00:00.000Z',
  tc_version: 'v1',
  privacy_version: 'v1',
};

const baseSigner = {
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

    // GET /sign/me → envelope + signer + zero fields. The prep page only
    // needs envelope.title and signer.{name,email,tc_accepted_at}.
    await page.route('**/sign/me', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          envelope: baseEnvelope,
          signer: baseSigner,
          fields: [],
          other_signers: [],
        }),
      });
    });

    // POST /sign/accept-terms → empty 204-style success.
    await page.route('**/sign/accept-terms', async (route: Route) => {
      await route.fulfill({ status: 200, body: '' });
    });
  });

  test('entry → prep → fill happy path', async ({ page }) => {
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

    // TODO: extend this spec to cover the rest of the happy path:
    //   - mock /sign/me with one required text field
    //   - mock /sign/fields/:id for the fill action
    //   - drive the FieldInputDrawer to "Continue" → /review
    //   - mock /sign/submit and seed the doneSnapshot sessionStorage
    //     so SigningDonePage doesn't bounce
    //   - assert the "Seald." success heading
    // The fill page mounts pdf.js and a multi-page canvas, so the
    // selectors there are heavier — left for a follow-up commit.
  });
});
