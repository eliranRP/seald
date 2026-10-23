import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Route } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SAMPLE_PDF = readFileSync(resolve(__dirname, './fixtures/sample-1page.pdf'));

/**
 * Multi-document signing happy path (WP-04, flag `multiDocumentEnvelopes`).
 *
 * One envelope, two one-page documents, one required text field on each.
 * The signer fills the field on the first document, the auto-advance
 * crosses to the second document on its own, the signer fills that field
 * too, then reviews (both documents named) and submits.
 *
 * The flag ships off, so it is switched on through the runtime override
 * the SPA reads (`__SEALD_FEATURE_OVERRIDES__`). All `/sign/*` calls are
 * intercepted with `page.route`; no backend.
 */

const ENVELOPE_ID = 'env-multi-001';
const TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SIGNER_ID = 'signer-multi-001';
const DOC_A = '11111111-1111-4111-8111-111111111111';
const DOC_B = '22222222-2222-4222-8222-222222222222';

function makeEnvelope() {
  return {
    id: ENVELOPE_ID,
    title: 'Closing package',
    short_code: 'MULTI-001',
    status: 'sent',
    original_pages: 1,
    expires_at: '2099-12-31T00:00:00.000Z',
    tc_version: 'v1',
    privacy_version: 'v1',
  };
}

function makeSigner() {
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

function makeField(id: string, documentId: string, valueText: string | null) {
  return {
    id,
    signer_id: SIGNER_ID,
    kind: 'text' as const,
    page: 1,
    x: 0.1,
    y: 0.2,
    width: 0.3,
    height: 0.05,
    required: true,
    value_text: valueText,
    filled_at: valueText === null ? null : '2026-10-22T10:00:00.000Z',
    document_id: documentId,
  };
}

const FIELD_DOC: Record<string, string> = { 'field-a': DOC_A, 'field-b': DOC_B };

test.describe('multi-document signing flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const host = window as unknown as {
        __SEALD_CONSENT_DISABLED: boolean;
        __SEALD_FEATURE_OVERRIDES__: Record<string, boolean>;
      };
      host.__SEALD_CONSENT_DISABLED = true;
      host.__SEALD_FEATURE_OVERRIDES__ = { multiDocumentEnvelopes: true };
    });

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

    await page.route('**/sign/me', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          envelope: makeEnvelope(),
          signer: makeSigner(),
          documents: [
            { id: DOC_A, ord: 1, title: 'Master agreement', original_pages: 1 },
            { id: DOC_B, ord: 2, title: 'Side letter', original_pages: 1 },
          ],
          fields: [makeField('field-a', DOC_A, null), makeField('field-b', DOC_B, null)],
          other_signers: [],
        }),
      });
    });

    for (const path of ['accept-terms', 'esign-disclosure', 'intent-to-sign']) {
      await page.route(`**/sign/${path}`, async (route: Route) => {
        await route.fulfill({ status: 200, body: '' });
      });
    }

    // Echo the field back filled with the value the page posted.
    await page.route('**/sign/fields/*', async (route: Route) => {
      const id = route.request().url().split('/').pop() ?? '';
      const body = route.request().postDataJSON() as { value_text?: string };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeField(id, FIELD_DOC[id] ?? DOC_A, body.value_text ?? 'x')),
      });
    });

    await page.route('**/sign/submit', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'submitted', envelope_status: 'completed' }),
      });
    });

    await page.route('**/verify/MULTI-001', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          envelope: { id: ENVELOPE_ID, short_code: 'MULTI-001', status: 'completed' },
          sealed_url: 'https://example.test/sealed.pdf',
          chain_intact: true,
        }),
      });
    });

    // /sign/pdf?document_id=… → the same one-page fixture for either document.
    await page.route('**/sign/pdf**', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: '/pdf-fixture.pdf' }),
      });
    });
    await page.route('**/pdf-fixture.pdf', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/pdf', body: SAMPLE_PDF });
    });
  });

  test('fills both documents, the auto-advance crossing from the first to the second', async ({
    page,
  }) => {
    await page.goto(`/sign/${ENVELOPE_ID}?t=${TOKEN}`);
    await page.waitForURL(`**/sign/${ENVELOPE_ID}/fill`, { timeout: 15_000 });

    await page.getByRole('checkbox', { name: /agree to sign electronically/i }).check();
    await page.getByRole('button', { name: /^start$/i }).click();

    // The rail lists both documents; the first is on screen.
    const rail = page.getByRole('navigation', { name: 'Documents to sign' });
    await expect(rail.getByRole('button')).toHaveCount(2);
    await expect(rail.getByRole('button', { name: /master agreement/i })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(
      rail.getByRole('button', { name: /side letter, document 2 of 2, 1 left/i }),
    ).toBeVisible();

    // Fill the field on the first document.
    await page.getByRole('button', { name: /text \(required\)/i }).click();
    const first = page.getByRole('dialog', { name: /^text$/i });
    await first.getByRole('textbox').fill('Answer one');
    await first.getByRole('button', { name: 'Apply' }).click();

    // The next required field is on the second document: the page switches to it.
    await expect(rail.getByRole('button', { name: /side letter/i })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await page.getByRole('button', { name: /text \(required\)/i }).click();
    const second = page.getByRole('dialog', { name: /^text$/i });
    await second.getByRole('textbox').fill('Answer two');
    await second.getByRole('button', { name: 'Apply' }).click();

    // Everything required is filled: Finish confirms and submits.
    await page.getByRole('button', { name: /^finish$/i }).click();
    await page
      .getByRole('dialog', { name: /finish signing/i })
      .getByRole('button', { name: /^sign$/i })
      .click();
    await page.waitForURL(`**/sign/${ENVELOPE_ID}/done`, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /^signed$/i })).toBeVisible();
  });
});
