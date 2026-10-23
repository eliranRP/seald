import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page, Route } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SAMPLE_PDF = readFileSync(resolve(__dirname, './sample-1page.pdf'));

export const SIGNER_TOKEN_PLACEHOLDER = 'a'.repeat(43);

export interface MockSigner {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

export interface MockEnvelope {
  readonly id: string;
  readonly shortCode: string;
  readonly title: string;
}

export function json(
  route: Route,
  status: number,
  body: unknown,
  headers?: Record<string, string>,
) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
    ...(headers ? { headers } : {}),
  });
}

export function signMeBody(envelope: MockEnvelope, signer: MockSigner) {
  return {
    envelope: {
      id: envelope.id,
      title: envelope.title,
      short_code: envelope.shortCode,
      status: 'sent',
      original_pages: 1,
      expires_at: '2099-12-31T00:00:00.000Z',
      tc_version: 'v1',
      privacy_version: 'v1',
    },
    signer: {
      id: signer.id,
      email: signer.email,
      name: signer.name,
      color: '#4f46e5',
      role: 'signatory' as const,
      status: 'viewing' as const,
      viewed_at: null,
      tc_accepted_at: null,
      signed_at: null,
      declined_at: null,
    },
    // One required text field that is already filled, so the fill page
    // shows "Review & finish" on first paint without driving the canvas.
    fields: [
      {
        id: `field-${signer.id}`,
        signer_id: signer.id,
        kind: 'text' as const,
        page: 1,
        x: 0.1,
        y: 0.2,
        width: 0.3,
        height: 0.05,
        required: true,
        value_text: 'Pre-filled answer',
        filled_at: '2026-10-22T10:00:00.000Z',
      },
    ],
    other_signers: [],
  };
}

/**
 * The `/sign/*` routes that never differ between these specs: consent
 * endpoints, the PDF, and the post-submit verify poll. The specs register
 * `/sign/start`, `/sign/me`, `/sign/submit` and the access-code routes
 * themselves because those carry the behavior under test.
 */
export async function installCommonSignerRoutes(page: Page, envelope: MockEnvelope): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __SEALD_CONSENT_DISABLED: boolean }).__SEALD_CONSENT_DISABLED = true;
  });
  for (const path of ['accept-terms', 'esign-disclosure', 'intent-to-sign']) {
    await page.route(`**/sign/${path}`, (route: Route) => route.fulfill({ status: 200, body: '' }));
  }
  await page.route('**/sign/pdf**', (route: Route) =>
    json(route, 200, { url: '/pdf-fixture.pdf' }),
  );
  await page.route('**/pdf-fixture.pdf', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/pdf', body: SAMPLE_PDF }),
  );
  await page.route(`**/verify/${envelope.shortCode}`, (route: Route) =>
    json(route, 200, {
      envelope: { id: envelope.id, short_code: envelope.shortCode, status: 'completed' },
      sealed_url: 'https://example.test/sealed.pdf',
      chain_intact: true,
    }),
  );
}
