import { test, expect, type Page, type Route } from '@playwright/test';
import { installCommonSignerRoutes, json, signMeBody } from './fixtures/signerRoutes';

/**
 * Emailed one-time code, signer side (WP-10 API, WP-11 web, flag
 * `signerAccessAuth`). The SPA needs no flag: the API decides, and with the
 * flag off `/sign/start` never answers `access_code_required`.
 *
 *  1. Entry: `/sign/start` answers `access_code_required`. The signer asks
 *     for a code (countdown from the cooldown), enters a wrong one (422),
 *     then the right one, and lands on the document.
 *  2. Re-check: the signer's `/sign/submit` answers 428, a fresh code is
 *     requested and entered, and the submit goes through with it.
 *
 * All `/sign/*` calls are intercepted with `page.route`; no backend.
 */

const ENVELOPE = { id: 'env-code-001', shortCode: 'CODE-001', title: 'Lease agreement' };
const SIGNER = { id: 'signer-code', email: 'ada@example.com', name: 'Ada' };
const TOKEN = 'c'.repeat(43);
const GOOD_CODE = '482913';

const SENT = (purpose: 'access' | 'action') => ({
  status: 'sent',
  purpose,
  email_masked: 'a***@example.com',
  expires_in_seconds: 600,
  resend_after_seconds: 60,
});

async function openCodeScreen(page: Page): Promise<void> {
  await page.goto(`/sign/${ENVELOPE.id}?t=${TOKEN}`);
  await expect(page.getByRole('heading', { name: /enter your emailed code/i })).toBeVisible();
}

test.describe('signer access code', () => {
  test.beforeEach(async ({ page }) => {
    await installCommonSignerRoutes(page, ENVELOPE);
  });

  test('entry screen: send, wrong code, right code, then the document', async ({ page }) => {
    let signedIn = false;
    const sends: string[] = [];

    await page.route('**/sign/start', (route: Route) =>
      json(route, 200, {
        status: 'access_code_required',
        envelope_id: ENVELOPE.id,
        signer_id: SIGNER.id,
        email_masked: 'a***@example.com',
      }),
    );
    await page.route('**/sign/access-code/send', async (route: Route) => {
      sends.push((route.request().postDataJSON() as { purpose: string }).purpose);
      return json(route, 200, SENT('access'));
    });
    await page.route('**/sign/access-code/verify', async (route: Route) => {
      const { code } = route.request().postDataJSON() as { code: string };
      if (code !== GOOD_CODE) return json(route, 422, { error: 'access_code_invalid' });
      signedIn = true;
      return json(route, 200, {
        envelope_id: ENVELOPE.id,
        signer_id: SIGNER.id,
        requires_tc_accept: true,
      });
    });
    await page.route('**/sign/me', (route: Route) =>
      signedIn ? json(route, 200, signMeBody(ENVELOPE, SIGNER)) : json(route, 401, { error: 'x' }),
    );

    await openCodeScreen(page);
    // Masked mailbox only, and wording that does not claim an identity check.
    await expect(page.getByText('a***@example.com').first()).toBeVisible();
    await expect(page.getByText(/identity|verified/i)).toHaveCount(0);
    await expect(page.getByRole('textbox')).toHaveCount(0);

    await page.getByRole('button', { name: 'Send code' }).click();
    const input = page.getByRole('textbox', { name: /one-time code/i });
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('autocomplete', 'one-time-code');
    expect(sends).toEqual(['access']);

    // The countdown is visible and Resend is not available yet.
    const resend = page.getByRole('button', { name: /^resend code in \d+s$/i });
    await expect(resend).toBeDisabled();

    // Wrong code: an accessible error, the field stays.
    await input.fill('000000');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('alert')).toContainText(/not right/i);
    await expect(input).toHaveAttribute('aria-invalid', 'true');

    // Right code, pasted with a space the way a mail client might copy it.
    await input.fill('482 913');
    await expect(input).toHaveValue(GOOD_CODE);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForURL(`**/sign/${ENVELOPE.id}/fill`, { timeout: 15_000 });
    await expect(page.getByRole('button', { name: /^start$/i })).toBeVisible();
  });

  test('entry screen: a send that is too soon shows the countdown from Retry-After', async ({
    page,
  }) => {
    await page.route('**/sign/start', (route: Route) =>
      json(route, 200, {
        status: 'access_code_required',
        envelope_id: ENVELOPE.id,
        signer_id: SIGNER.id,
        email_masked: 'a***@example.com',
      }),
    );
    await page.route('**/sign/access-code/send', (route: Route) =>
      json(route, 429, { error: 'access_code_cooldown' }, { 'Retry-After': '45' }),
    );

    await openCodeScreen(page);
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByRole('alert')).toContainText(/just sent/i);
    await expect(page.getByRole('button', { name: /^resend code in (4[0-5])s$/i })).toBeDisabled();
  });

  test('entry screen: too many wrong codes locks the code and a new one is requested', async ({
    page,
  }) => {
    await page.route('**/sign/start', (route: Route) =>
      json(route, 200, {
        status: 'access_code_required',
        envelope_id: ENVELOPE.id,
        signer_id: SIGNER.id,
        email_masked: 'a***@example.com',
      }),
    );
    await page.route('**/sign/access-code/send', (route: Route) =>
      json(route, 200, { ...SENT('access'), resend_after_seconds: 1 }),
    );
    await page.route('**/sign/access-code/verify', (route: Route) =>
      json(route, 423, { error: 'access_code_locked' }),
    );

    await openCodeScreen(page);
    await page.getByRole('button', { name: 'Send code' }).click();
    await page.getByRole('textbox', { name: /one-time code/i }).fill('111111');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('alert')).toContainText(/too many incorrect codes/i);
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /send a new code/i })).toBeVisible();
  });

  test('re-check before signing: submit answers 428, a fresh code finishes it', async ({
    page,
  }) => {
    const submits: Array<{ access_code?: string } | null> = [];

    await page.route('**/sign/start', (route: Route) =>
      json(route, 200, {
        envelope_id: ENVELOPE.id,
        signer_id: SIGNER.id,
        requires_tc_accept: true,
      }),
    );
    await page.route('**/sign/me', (route: Route) =>
      json(route, 200, signMeBody(ENVELOPE, SIGNER)),
    );
    await page.route('**/sign/access-code/send', async (route: Route) => {
      expect(route.request().postDataJSON()).toEqual({ purpose: 'action' });
      return json(route, 200, SENT('action'));
    });
    await page.route('**/sign/submit', async (route: Route) => {
      const body = route.request().postDataJSON() as { access_code?: string } | null;
      submits.push(body);
      if (body?.access_code === undefined)
        return json(route, 428, { error: 'access_code_required' });
      if (body.access_code !== GOOD_CODE) return json(route, 422, { error: 'access_code_invalid' });
      return json(route, 200, { status: 'submitted', envelope_status: 'sealing' });
    });

    await page.goto(`/sign/${ENVELOPE.id}?t=${TOKEN}`);
    await page.waitForURL(`**/sign/${ENVELOPE.id}/fill`, { timeout: 15_000 });
    await page.getByRole('checkbox', { name: /agree to sign electronically/i }).check();
    await page.getByRole('button', { name: /^start$/i }).click();
    await page.getByRole('button', { name: /^finish$/i }).click();
    const sheet = page.getByRole('dialog', { name: /finish signing/i });
    await sheet.getByRole('button', { name: /^sign$/i }).click();

    // The final step now asks for a fresh emailed code.
    const panel = sheet;
    await expect(panel).toBeVisible();
    await expect(panel.getByText('a***@example.com')).toBeVisible();
    await panel.getByRole('button', { name: 'Send code' }).click();
    const input = panel.getByRole('textbox', { name: /one-time code/i });

    await input.fill('000000');
    await panel.getByRole('button', { name: /^sign$/i }).click();
    await expect(panel.getByRole('alert')).toContainText(/not right/i);

    await input.fill(GOOD_CODE);
    await panel.getByRole('button', { name: /^sign$/i }).click();
    await page.waitForURL(`**/sign/${ENVELOPE.id}/done`, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /^signed$/i })).toBeVisible();
    expect(submits).toEqual([null, { access_code: '000000' }, { access_code: GOOD_CODE }]);
  });
});
