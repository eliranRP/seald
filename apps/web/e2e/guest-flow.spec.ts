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

  // Any envelope-side traffic the editor may emit while we're driving it.
  // Guest mode short-circuits the real send chain, so these are tolerant
  // catch-alls only — no assertions read them.
  await page.route('**/envelopes/**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
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
    // "0 selected" to "1 selected" even though POST /contacts returned 401.
    // (This is exactly the bug screenshot the user reported — counter
    // stuck at 0 — that motivated the fix.)
    await expect(page.getByText(/^1 selected$/i)).toBeVisible();

    // Confirm at least one POST attempt actually fired so we know the
    // 401 path was exercised, not skipped.
    expect(log.contactsPostAttempts).toBeGreaterThanOrEqual(1);

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
    await page.getByRole('button', { name: /^apply$/i }).click();

    // ---- Send (guest mode short-circuits to /document/:id/sent locally).
    await page.getByRole('button', { name: /send to sign/i }).click();
    await page.waitForURL(/\/document\/[^/]+\/sent$/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/document\/[^/]+\/sent$/);
  });
});
