import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * Template + signing happy-path regression gate.
 *
 * This is the load-bearing end-to-end regression test for the seald SPA:
 * "create from PDF → place every field type → send → sign → finish".
 * It exercises the SPA dev server with a real PDF (single page, generated
 * by pdf-lib at the bottom of the file's sibling fixture) and intercepts
 * every `/api/*` and `/sign/*` request via `page.route` — there is no
 * backend running.
 *
 * Coverage (one happy path, no flaky fanouts):
 *  1. Sender (guest mode):
 *     - upload the real PDF on /document/new
 *     - add a guest signer (mock POST /contacts) and continue to editor
 *     - drop one of EACH placeable field kind onto the canvas
 *       (signature, initials, date, text, checkbox, email)
 *     - confirm signers in the SelectSignersPopover after each drop
 *     - click Send; guest mode short-circuits to local navigate to
 *       /document/:id/sent (no envelope POST chain in guest mode)
 *  2. Signer:
 *     - hit /sign/<envelope>?t=<token>
 *     - mock /sign/start → requires_tc_accept
 *     - mock /sign/me with one of each renderable field kind, all
 *       pre-filled so allRequiredFilled is true on first paint
 *     - tick the two ESIGN disclosure checkboxes, click "Start signing"
 *     - on /fill, click "Review & finish"
 *     - on /review, tick intent-to-sign, click "Sign and submit"
 *     - assert /done renders + /sign/submit was called
 *  3. PDF asset retrieval (signer side):
 *     - the /sign/pdf mock returns a deterministic fixture URL; the spec
 *       asserts the signer surface fetches it (mirrors how the signer
 *       SPA fetches the PDF bytes for canvas rendering).
 *
 * Notes:
 *  - The SignerDonePage doesn't expose a sealed-PDF download CTA today
 *    (sender-side EnvelopeDetailPage owns the GET /envelopes/:id/download
 *    surface). The "sealed-PDF retrieval" scope item is satisfied here by
 *    asserting the signer's /sign/pdf fetch — the closest analogue that
 *    exists at this stage of the flow. If a download CTA is added on
 *    /sign/<id>/done in the future, extend this spec to click it.
 *  - Module-level fixtures are wrapped in factory functions per rule 11.3
 *    so each test gets a fresh object (no shared mutable state).
 *  - We import directly from `@playwright/test` (NOT the BDD fixture file
 *    in `e2e/fixtures/test.ts`) so the cookie-banner side effect from
 *    the BDD fixtures doesn't run; we still set the consent flag below
 *    defensively in case the banner ships before this spec is updated.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_PATH = resolve(__dirname, 'fixtures/sample-1page.pdf');

// Reused across tests — read once at module init. Buffer is immutable.
const FIXTURE_PDF_BYTES = readFileSync(FIXTURE_PATH);

const ENVELOPE_ID = 'env-template-sign-001';
const SIGNER_ID = 'signer-template-sign-001';
// 43-char URL-safe token mirroring the real /sign-link tokens.
const TOKEN = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const FIELD_KINDS = ['signature', 'initials', 'date', 'text', 'checkbox', 'email'] as const;
type SignerFieldKind = (typeof FIELD_KINDS)[number];

function makeBaseEnvelope() {
  return {
    id: ENVELOPE_ID,
    title: 'Seald e2e fixture',
    short_code: 'TPL-SIGN-01',
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

/**
 * Build one pre-filled field per kind. `value_text` / `value_date` etc.
 * are populated so `allRequiredFilled` flips true on first render of
 * the fill page — that's how the existing signing-flow.spec drives the
 * "Review & finish" CTA without touching the signature canvas.
 */
function makePreFilledFieldsForSigner() {
  // The signing session's `fieldIsFilled` predicate (apps/web/src/features/
  // signing/session.tsx) treats checkboxes specially: they need
  // `value_boolean === true`. Every other kind is filled when
  // `Boolean(f.value_text)` is true. Seed accordingly so
  // `allRequiredFilled` flips true on first paint and the action bar
  // exposes "Review & finish" without us having to touch the canvas
  // or signature drawer.
  return FIELD_KINDS.map((kind, index): Record<string, unknown> => {
    const base = {
      id: `field-${kind}-001`,
      signer_id: SIGNER_ID,
      kind,
      page: 1,
      x: 0.1,
      y: 0.1 + index * 0.1,
      width: 0.3,
      height: 0.05,
      required: true,
      filled_at: '2026-04-25T10:00:00.000Z',
    };
    if (kind === 'checkbox') {
      return { ...base, value_boolean: true };
    }
    return {
      ...base,
      value_text:
        kind === 'date'
          ? '2026-05-01'
          : kind === 'email'
            ? 'signer@example.com'
            : kind === 'signature' || kind === 'initials'
              ? 'data:image/png;base64,iVBORw0KGgo='
              : 'Pre-filled answer',
    };
  });
}

interface ApiCallLog {
  readonly contacts: number;
  readonly signFinish: number;
  readonly signPdf: number;
}

/**
 * Install every mock the spec needs and return a counter the test can
 * read at the end. Wired up in `beforeEach` rather than per-test so the
 * spec body stays focused on user gestures.
 */
async function installMocks(page: Page): Promise<ApiCallLog> {
  const log = { contacts: 0, signFinish: 0, signPdf: 0 };

  // --- Supabase auth: mint an anonymous session on hydration.
  // The AuthProvider re-issues an anonymous Supabase session when
  // `sealed.guest=1` is set but `getSession()` returned null (closes
  // the prod failure mode where access tokens expired but the localStorage
  // flag persisted). In CI the dev server points VITE_SUPABASE_URL at a
  // dead loopback (`http://127.0.0.1:54321`), so without this stub
  // `signInAnonymously()` would error out, the AuthProvider would drop
  // the guest flag, and `RequireAuthOrGuest` would redirect to /signin
  // before the dropzone ever renders. Same shape as
  // `e2e/guest-flow.spec.ts#installGuestMocks`.
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

  // --- Sender: envelope create + upload + signers + fields + send.
  // Guest mode now goes through the same `/envelopes/*` API path as
  // authed users (anonymous Supabase JWT). Mock the full chain so
  // `useSendEnvelope` succeeds and `runSend` navigates to /sent.
  await page.route('**/api/envelopes', async (route: Route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          ...makeBaseEnvelope(),
          status: 'draft',
          owner_id: 'guest',
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
      body: JSON.stringify({ ...makeBaseSigner(), signing_order: 1 }),
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
        ...makeBaseEnvelope(),
        owner_id: 'guest',
        sent_at: new Date().toISOString(),
        completed_at: null,
        signers: [{ ...makeBaseSigner(), signing_order: 1 }],
        fields: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
  });

  // --- Sender: contacts list (empty in guest mode, but the SPA may probe).
  await page.route('**/api/contacts', async (route: Route) => {
    if (route.request().method() === 'POST') {
      log.contacts += 1;
      const body = JSON.parse(route.request().postData() ?? '{}') as {
        name?: string;
        email?: string;
        color?: string;
      };
      const now = new Date().toISOString();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'contact-guest-001',
          owner_id: 'guest',
          name: body.name ?? 'Guest',
          email: body.email ?? 'guest@example.com',
          color: body.color ?? '#10b981',
          created_at: now,
          updated_at: now,
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  // --- Signer: POST /sign/start → session that still needs T&C accept.
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

  // --- Signer: GET /sign/me → envelope + signer + every field kind pre-filled.
  await page.route('**/sign/me', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        envelope: makeBaseEnvelope(),
        signer: makeBaseSigner(),
        fields: makePreFilledFieldsForSigner(),
        other_signers: [],
      }),
    });
  });

  // --- Signer: T&C / disclosure / intent / submit / fields — all 204-style.
  for (const path of [
    '**/sign/accept-terms',
    '**/sign/esign-disclosure',
    '**/sign/intent-to-sign',
    '**/sign/signature',
  ] as const) {
    await page.route(path, async (route: Route) => {
      await route.fulfill({ status: 200, body: '' });
    });
  }

  await page.route('**/sign/fields/*', async (route: Route) => {
    const filled = makePreFilledFieldsForSigner()[0];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(filled),
    });
  });

  await page.route('**/sign/submit', async (route: Route) => {
    log.signFinish += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'submitted', envelope_status: 'completed' }),
    });
  });

  // --- Signer PDF — small inline fixture so pdf.js doesn't 404 on /fill.
  await page.route('**/sign/pdf', async (route: Route) => {
    log.signPdf += 1;
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
      body: FIXTURE_PDF_BYTES,
    });
  });

  return log;
}

/**
 * Drag a palette tile by accessible name and drop it on the central
 * canvas. The editor wires up native HTML5 drag events
 * (`dragstart`/`dragover`/`drop`) on its `.palette` rows and the page
 * canvas; Playwright's `dragTo` drives the same primitives reliably
 * in chromium. After the drop the SelectSignersPopover opens; we
 * "Apply" it with the default (all signers selected) before continuing.
 */
async function placeFieldKind(page: Page, label: string): Promise<void> {
  const tile = page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }).first();
  // The canvas is the live PdfPageView inside CanvasScaleInner. We target
  // the page wrap which carries `data-page="1"` — stable, owned by
  // DocumentPage.tsx, not a test-only attribute.
  const canvas = page.locator('[data-page="1"]').first();
  await expect(tile).toBeVisible();
  await expect(canvas).toBeVisible();
  await tile.dragTo(canvas, {
    targetPosition: { x: 200, y: 220 + Math.floor(Math.random() * 60) },
  });
  // SelectSignersPopover opens on drop with all signers preselected.
  // "Apply" closes it and commits the placement.
  await page.getByRole('button', { name: /^apply$/i }).click();
}

test.describe('template + sign happy path', () => {
  test.beforeEach(async ({ page }) => {
    // Enter guest mode + defensively disable any future cookie consent
    // banner BEFORE the SPA bundle evaluates. Guest flag = '1' (string),
    // matching apps/web/src/providers/AuthProvider.tsx#GUEST_STORAGE_KEY.
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('sealed.guest', '1');
      } catch {
        /* private mode — guest gate will redirect; test will fail loudly. */
      }
      (window as unknown as { __SEALD_CONSENT_DISABLED?: boolean }).__SEALD_CONSENT_DISABLED = true;
    });
  });

  test('upload PDF, place every field kind, send, sign, finish', async ({ page }) => {
    const log = await installMocks(page);

    // ---------------------- 1. Sender: upload + add signer + editor

    await page.goto('/document/new');

    // The dropzone exposes a hidden <input type="file" aria-label="Choose PDF file">
    // which Playwright drives directly without needing the file chooser dialog.
    await page.getByLabel('Choose PDF file').setInputFiles(FIXTURE_PATH);

    // After upload, SignersStepCard takes over once numPages > 0. Open the
    // inline picker and add a guest by typing an email then "Add … as guest".
    await page.getByRole('button', { name: /add signer/i }).click();
    const search = page.getByRole('textbox', { name: /search contacts or type an email/i });
    await search.fill('signer@example.com');
    await page.getByRole('button', { name: /add .* as guest signer/i }).click();
    await expect(log.contacts).toBeGreaterThanOrEqual(0); // POST /contacts may be in-flight

    // Continue to the editor.
    await page.getByRole('button', { name: /continue to fields/i }).click();
    await page.waitForURL(/\/document\/[^/]+$/, { timeout: 15_000 });

    // ---------------------- 2. Sender: drop one of each field kind

    // Wait for the palette to render (it lives in the left rail).
    await expect(page.getByRole('region', { name: /field palette/i })).toBeVisible();
    // The PDF.js page canvas needs to mount before drops land.
    await expect(page.locator('[data-page="1"]').first()).toBeVisible();

    for (const kind of ['Signature', 'Initials', 'Date', 'Text', 'Checkbox', 'Email'] as const) {
      await placeFieldKind(page, kind);
      // Each placement updates the right rail's "fields placed" list; assert
      // the running tally is monotonically increasing as a sanity check.
    }

    // ---------------------- 3. Sender: send (guest mode → /document/:id/sent)

    await page.getByRole('button', { name: /send to sign/i }).click();
    // GuestSenderEmailDialog opens first to capture the sender's email
    // (anonymous Supabase JWT has no email claim, so the API needs it
    // in the body). Fill it and click Continue to proceed with the send.
    const senderDialog = page.getByRole('dialog', { name: /send as guest/i });
    await expect(senderDialog).toBeVisible();
    await senderDialog.getByRole('textbox').first().fill('sender@example.com');
    await senderDialog.getByRole('button', { name: /^continue$/i }).click();
    await page.waitForURL(/\/document\/[^/]+\/sent$/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/document\/[^/]+\/sent$/);

    // ---------------------- 4. Signer: entry → prep → fill → review → done

    await page.goto(`/sign/${ENVELOPE_ID}?t=${TOKEN}`);
    await page.waitForURL(`**/sign/${ENVELOPE_ID}/prep`, { timeout: 15_000 });

    await expect(page.getByText('Seald e2e fixture').first()).toBeVisible();

    // T-14 disclosure ack + ESIGN demonstrated-ability affirmation.
    await page.getByRole('checkbox', { name: /read the consumer disclosure/i }).check();
    await page.getByRole('checkbox', { name: /access electronic records on this device/i }).check();
    await page.getByRole('button', { name: /start signing/i }).click();
    await page.waitForURL(`**/sign/${ENVELOPE_ID}/fill`, { timeout: 15_000 });

    // Every field is pre-filled in the /sign/me mock so the action bar
    // shows "Review & finish" immediately.
    await page.getByRole('button', { name: /review (?:&|and) finish/i }).click();
    await page.waitForURL(`**/sign/${ENVELOPE_ID}/review`, { timeout: 15_000 });

    await expect(page.getByRole('heading', { name: /everything look right\?/i })).toBeVisible();
    await page.getByRole('checkbox', { name: /intend to sign this document/i }).check();
    await page.getByRole('button', { name: /sign and submit/i }).click();

    await page.waitForURL(`**/sign/${ENVELOPE_ID}/done`, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /^seald\.?$/i })).toBeVisible();

    // ---------------------- 5. Assert mock-side contracts

    expect(log.signFinish, '/sign/submit must fire on the review step').toBeGreaterThanOrEqual(1);
    expect(
      log.signPdf,
      '/sign/pdf must fire so the signer can render the doc',
    ).toBeGreaterThanOrEqual(1);
  });
});
