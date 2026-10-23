import { test, expect, type Page, type Route } from '@playwright/test';
import { installCommonSignerRoutes, json, signMeBody } from './fixtures/signerRoutes';
import type { MockSigner } from './fixtures/signerRoutes';

/**
 * Two-step sequential envelope, signer side (WP-05/WP-06, carried over from
 * the WP-06 review). Signer 1 is step 1 and signer 2 is step 2. Until
 * signer 1 submits, the API answers signer 2's link and session with
 * `409 { error: "not_your_turn" }`; the SPA shows the not-your-turn page
 * (a wait, not an error). After signer 1 submits, signer 2 gets in.
 *
 * All `/sign/*` calls are intercepted with `page.route`; no backend. The
 * 409 body is the API's real shape (`{ error: <slug> }`).
 */

const ENVELOPE = { id: 'env-seq-001', shortCode: 'SEQ-001', title: 'Two step agreement' };
const ADA: MockSigner = { id: 'signer-ada', email: 'ada@example.com', name: 'Ada' };
const BO: MockSigner = { id: 'signer-bo', email: 'bo@example.com', name: 'Bo' };
const TOKENS: Record<string, MockSigner> = {
  ['a'.repeat(43)]: ADA,
  ['b'.repeat(43)]: BO,
};
const [ADA_TOKEN, BO_TOKEN] = Object.keys(TOKENS) as [string, string];

interface OrderState {
  /** Whose session cookie the "browser" holds. */
  current: MockSigner | null;
  adaSigned: boolean;
}

async function installSequentialApi(page: Page, state: OrderState): Promise<void> {
  await installCommonSignerRoutes(page, ENVELOPE);

  const blocked = (signer: MockSigner | null): boolean => signer?.id === BO.id && !state.adaSigned;

  await page.route('**/sign/start', async (route: Route) => {
    const { token } = route.request().postDataJSON() as { token: string };
    const signer = TOKENS[token] ?? null;
    if (signer === null) return json(route, 401, { error: 'invalid_token' });
    if (blocked(signer)) return json(route, 409, { error: 'not_your_turn' });
    state.current = signer;
    return json(route, 200, {
      envelope_id: ENVELOPE.id,
      signer_id: signer.id,
      requires_tc_accept: true,
    });
  });

  await page.route('**/sign/me', async (route: Route) => {
    if (state.current === null) return json(route, 401, { error: 'no_session' });
    if (blocked(state.current)) return json(route, 409, { error: 'not_your_turn' });
    return json(route, 200, signMeBody(ENVELOPE, state.current));
  });

  await page.route('**/sign/submit', async (route: Route) => {
    if (state.current?.id === ADA.id) state.adaSigned = true;
    return json(route, 200, { status: 'submitted', envelope_status: 'sealing' });
  });
}

async function signThrough(page: Page, token: string): Promise<void> {
  await page.goto(`/sign/${ENVELOPE.id}?t=${token}`);
  await page.waitForURL(`**/sign/${ENVELOPE.id}/prep`, { timeout: 15_000 });
  await page.getByRole('checkbox', { name: /read the consumer disclosure/i }).check();
  await page.getByRole('checkbox', { name: /open and download a PDF on this device/i }).check();
  await page.getByRole('button', { name: /start signing/i }).click();
  await page.waitForURL(`**/sign/${ENVELOPE.id}/fill`, { timeout: 15_000 });
  await page.getByRole('button', { name: /review (?:&|and) finish/i }).click();
  await page.waitForURL(`**/sign/${ENVELOPE.id}/review`, { timeout: 15_000 });
  await page.getByRole('checkbox', { name: /intend to sign this document/i }).check();
  await page.getByRole('button', { name: /sign and submit/i }).click();
  await page.waitForURL(`**/sign/${ENVELOPE.id}/done`, { timeout: 15_000 });
}

const NOT_YOUR_TURN = /not your turn to sign yet/i;

test.describe('sequential signing, two steps', () => {
  test('signer 2 sees the not-your-turn page until signer 1 finishes, then gets in', async ({
    page,
  }) => {
    const state: OrderState = { current: null, adaSigned: false };
    await installSequentialApi(page, state);

    // Step 2 opens the link too early: a calm wait page, not an error.
    await page.goto(`/sign/${ENVELOPE.id}?t=${BO_TOKEN}`);
    await expect(page.getByRole('heading', { name: NOT_YOUR_TURN })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByText(/email you a signing link as soon as it/i)).toBeVisible();

    // Step 1 signs through to the done page.
    await signThrough(page, ADA_TOKEN);
    await expect(page.getByRole('heading', { name: /^signed\.$/i })).toBeVisible();
    expect(state.adaSigned).toBe(true);

    // Step 2's link now works.
    await page.goto(`/sign/${ENVELOPE.id}?t=${BO_TOKEN}`);
    await page.waitForURL(`**/sign/${ENVELOPE.id}/prep`, { timeout: 15_000 });
    await expect(page.getByRole('button', { name: /start signing/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: NOT_YOUR_TURN })).toHaveCount(0);
  });

  test('an open session of signer 2 waits on the not-your-turn page and Check again lets them in', async ({
    page,
  }) => {
    const state: OrderState = { current: BO, adaSigned: false };
    await installSequentialApi(page, state);

    await page.goto(`/sign/${ENVELOPE.id}/prep`);
    await expect(page.getByRole('heading', { name: NOT_YOUR_TURN })).toBeVisible();

    // Still step 1's turn: checking again keeps the wait page. Wait for that
    // check's answer before signer 1 finishes, so the two cannot overlap.
    const stillWaiting = page.waitForResponse(
      (res) => res.url().endsWith('/sign/me') && res.status() === 409,
    );
    await page.getByRole('button', { name: 'Check again' }).click();
    await stillWaiting;
    await expect(page.getByRole('heading', { name: NOT_YOUR_TURN })).toBeVisible();

    // Signer 1 finishes elsewhere; the next check opens the prep page.
    state.adaSigned = true;
    await page.getByRole('button', { name: 'Check again' }).click();
    await expect(page.getByRole('button', { name: /start signing/i })).toBeVisible();
  });
});
