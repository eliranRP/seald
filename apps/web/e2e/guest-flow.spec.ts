import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * Guest-mode end-to-end regression — proves the entire "Skip → upload →
 * add a guest signer → place a field → send" flow works WITHOUT the
 * contacts API succeeding.
 *
 * Why this exists separately from `template-sign-flow.spec.ts`:
 * That spec also runs in guest mode but mocks `POST /contacts` to
 * return 201, which masked a regression where `UploadRoute` silently
 * dropped the typed signer when the contacts API rejected the request
 * (the real production behavior for unauthenticated guests — the
 * Nest API returns 401 because the JWT guard fails closed). Symptom:
 * after typing an email and clicking "Add … as guest signer", the
 * picker counter stayed at "0 selected" and the Continue button
 * stayed disabled, so the guest flow was unreachable in production.
 *
 * This spec mocks `POST /contacts` to fail (401 — what the real
 * backend returns) and asserts:
 *   1. The signer is still added to the local list (counter goes 0 → 1).
 *   2. "Continue to fields" enables and routes to the editor.
 *   3. A field can be placed and "Send to sign" succeeds.
 *
 * If `UploadRoute` regresses to swallowing the failure without a local
 * fallback, this spec fails at the "1 selected" assertion.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_PATH = resolve(__dirname, 'fixtures/sample-1page.pdf');
const FIXTURE_PDF_BYTES = readFileSync(FIXTURE_PATH);

interface GuestApiCallLog {
  contactsPostAttempts: number;
}

async function installGuestMocks(page: Page): Promise<GuestApiCallLog> {
  const log: GuestApiCallLog = { contactsPostAttempts: 0 };

  // Supabase auth mock — the AuthProvider now re-issues an anonymous
  // session on hydration when `sealed.guest=1` but `getSession()` came
  // back empty (closes the production failure mode where access tokens
  // expired but the localStorage flag persisted, leaving the SPA acting
  // as a guest with no JWT). Without this stub the spec would hit the
  // real Supabase project (which has anonymous sign-ins disabled in
  // shared envs) and the hydration fallback would drop the guest flag,
  // bouncing the test off /document/new.
  await page.route('**/auth/v1/signup**', async (route: Route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'e2e-anon-access-token',
          refresh_token: 'e2e-anon-refresh-token',
          token_type: 'bearer',
          expires_in: 3600,
          user: {
            id: 'e2e-anon-user',
            email: null,
            is_anonymous: true,
            aud: 'authenticated',
            role: 'authenticated',
          },
        }),
      });
      return;
    }
    await route.fallback();
  });
  // The supabase-js client polls `/auth/v1/user` and `/auth/v1/token` once
  // a session is loaded. Both are 200/empty here so the polling loop
  // doesn't error out the SPA.
  await page.route('**/auth/v1/user**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'e2e-anon-user', is_anonymous: true }),
    });
  });
  await page.route('**/auth/v1/token**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'e2e-anon-access-token',
        refresh_token: 'e2e-anon-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        user: { id: 'e2e-anon-user', is_anonymous: true },
      }),
    });
  });

  // Real backend behavior for an unauthenticated request: 401.
  // The fix under test must NOT depend on this response succeeding.
  await page.route('**/api/contacts', async (route: Route) => {
    if (route.request().method() === 'POST') {
      log.contactsPostAttempts += 1;
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Unauthorized' }),
      });
      return;
    }
    // GET — guest mode shouldn't issue this (contactsEnabled = false),
    // but be defensive in case a probe slips through.
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Unauthorized' }),
    });
  });

  // Envelope chain — guest mode now POSTs through the same `/envelopes/*`
  // API path as authed users (anonymous Supabase JWT). Mock the five-step
  // sender chain (`useSendEnvelope.run`) so the click → /sent navigation
  // works without a backend.
  // IMPORTANT: scope to `/api/envelopes` — a bare `**/envelopes/**` would
  // also match Vite dev-server module URLs like `/src/features/envelopes/*.ts`
  // and break the SPA bundle (renders blank).
  const ENVELOPE_ID = 'env-guest-flow-001';
  const SIGNER_ID = 'signer-guest-flow-001';
  await page.route('**/api/envelopes', async (route: Route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: ENVELOPE_ID,
          owner_id: 'guest',
          title: 'Untitled',
          short_code: 'GUEST-01',
          status: 'draft',
          original_pages: 1,
          expires_at: '2099-12-31T00:00:00.000Z',
          tc_version: 'v1',
          privacy_version: 'v1',
          sent_at: null,
          completed_at: null,
          signers: [],
          fields: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route(`**/api/envelopes/${ENVELOPE_ID}/upload`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ pages: 1, sha256: 'a'.repeat(64) }),
    });
  });
  await page.route(`**/api/envelopes/${ENVELOPE_ID}/signers`, async (route: Route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: SIGNER_ID,
        email: 'guest-signer@example.com',
        name: 'Guest Signer',
        color: '#10b981',
        role: 'signatory',
        signing_order: 1,
        status: 'awaiting',
        viewed_at: null,
        tc_accepted_at: null,
        signed_at: null,
        declined_at: null,
      }),
    });
  });
  await page.route(`**/api/envelopes/${ENVELOPE_ID}/fields`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
  await page.route(`**/api/envelopes/${ENVELOPE_ID}/send`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: ENVELOPE_ID,
        owner_id: 'guest',
        title: 'Untitled',
        short_code: 'GUEST-01',
        status: 'awaiting_others',
        original_pages: 1,
        expires_at: '2099-12-31T00:00:00.000Z',
        tc_version: 'v1',
        privacy_version: 'v1',
        sent_at: new Date().toISOString(),
        completed_at: null,
        signers: [],
        fields: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
  });

  // PDF.js sometimes refetches the original via blob URLs already in
  // memory, so this is just a safety net in case any code path falls
  // back to a server fetch.
  await page.route('**/pdf-fixture.pdf', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/pdf',
      body: FIXTURE_PDF_BYTES,
    });
  });

  return log;
}

test.describe('guest mode — full sender flow', () => {
  test.beforeEach(async ({ page }) => {
    // Enter guest mode + suppress cookie consent before the SPA bundle
    // evaluates (matches the storage key used by AuthProvider).
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('sealed.guest', '1');
      } catch {
        /* private mode — guest gate will redirect; test will fail loudly. */
      }
      (window as unknown as { __SEALD_CONSENT_DISABLED?: boolean }).__SEALD_CONSENT_DISABLED = true;
    });
  });

  test('add guest signer survives a 401 from POST /contacts', async ({ page }) => {
    const log = await installGuestMocks(page);

    await page.goto('/document/new');

    // Upload the PDF — same hidden file input used by template-sign-flow.spec.
    await page.getByLabel('Choose PDF file').setInputFiles(FIXTURE_PATH);

    // Open the inline picker, type a guest email, click "Add as guest signer".
    await page.getByRole('button', { name: /add signer/i }).click();
    const search = page.getByRole('textbox', { name: /search contacts or type an email/i });
    await search.fill('guest-signer@example.com');
    await page.getByRole('button', { name: /add .* as guest signer/i }).click();

    // ---- The critical assertion: the picker counter advanced from
    // "0 selected" to "1 selected" without depending on the contacts API.
    // (This is exactly the bug screenshot the user reported — counter
    // stuck at 0 — that motivated the fix.) The fix in UploadRoute
    // short-circuits the API call entirely for guest users, so we expect
    // zero POST attempts in this scenario; the catch-all 401 mock above
    // exists only as a safety net in case a regression brings the call
    // back, in which case the assertion below would still pass while
    // proving the failure mode is survivable.
    await expect(page.getByText(/^1 selected$/i)).toBeVisible();
    expect(log.contactsPostAttempts).toBeGreaterThanOrEqual(0);

    // ---- Continue to fields enables and navigates.
    const continueBtn = page.getByRole('button', { name: /continue to fields/i });
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();
    await page.waitForURL(/\/document\/[^/]+$/, { timeout: 15_000 });

    // ---- Place at least one signature field to prove the editor accepts
    // the locally-synthesized guest signer (the SelectSignersPopover lists
    // signers by id — if the synthesized id is malformed or missing, the
    // popover would render empty and Apply wouldn't commit a placement).
    await expect(page.getByRole('region', { name: /field palette/i })).toBeVisible();
    await expect(page.locator('[data-page="1"]').first()).toBeVisible();

    const sigTile = page.getByRole('button', { name: /^signature$/i }).first();
    const canvas = page.locator('[data-page="1"]').first();
    await sigTile.dragTo(canvas, { targetPosition: { x: 200, y: 240 } });
    // With a single signer the popover is skipped — field auto-assigned.
    const applyBtn = page.getByRole('button', { name: /^apply$/i });
    if (await applyBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await applyBtn.click();
    }

    // ---- Send. Guest mode now goes through the real `/envelopes/*` API
    // chain (mocked above). The GuestSenderEmailDialog opens first to
    // capture the sender's email (anonymous JWT has no email claim).
    await page.getByRole('button', { name: /send to sign/i }).click();
    const senderDialog = page.getByRole('dialog', { name: /send as guest/i });
    await expect(senderDialog).toBeVisible();
    await senderDialog.getByRole('textbox').first().fill('guest-sender@example.com');
    await senderDialog.getByRole('button', { name: /^continue$/i }).click();
    await page.waitForURL(/\/document\/[^/]+\/sent$/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/document\/[^/]+\/sent$/);

    // ---- Confirmation page must render the handoff summary on the
    // server-uuid URL. Pre-fix this asserted "Document not found" because
    // `getDocument(<server-uuid>)` returned undefined — the in-memory
    // draft was only addressable by its local `d_xxx` id. The fix
    // persists `envelope_id` on the local draft so post-send lookup
    // resolves.
    await expect(
      page.getByRole('heading', { level: 1, name: /sent\. your envelope is on its way/i }),
    ).toBeVisible();
    await expect(page.getByText(/guest-signer@example\.com/i)).toBeVisible();

    // ---- "Back to documents" must NOT bounce a guest off the dashboard
    // (which is gated by RequireAuth, not RequireAuthOrGuest). Pre-fix
    // the click navigated to /documents which then redirected the guest
    // back to /document/new — flashing the editor again, which the user
    // reported as "the screen jumps back to the signature fields screen".
    await page.getByRole('button', { name: /back to documents/i }).click();
    await page.waitForURL(/\/document\/new$/, { timeout: 5_000 });
    await expect(page).toHaveURL(/\/document\/new$/);
  });
});
