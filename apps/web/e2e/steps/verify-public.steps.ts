import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When, Then } = createBdd(test);

/**
 * Public-verifier BDD steps. The /verify/:shortCode route is unauth and
 * read-only — the SPA only needs a single GET to the API. We mock that
 * with `mockedApi.on(...)` and let the rest of the page render against
 * the canned payload.
 *
 * The shape of the JSON below mirrors `apps/api/src/verify/verify.controller.ts`
 * exactly; if the API contract drifts (e.g. adds/removes a field) the
 * scenario will fail loudly because `useVerifyEnvelope` types it through
 * `VerifyResponse`.
 */

interface CannedVerifyOptions {
  readonly chainIntact: boolean;
  readonly title?: string;
}

function buildVerifyPayload(shortCode: string, opts: CannedVerifyOptions) {
  const id = '804a6c00-2ad9-4590-9269-de3e13f61e62';
  const title = opts.title ?? 'Mutual NDA — 2026.pdf';
  return {
    envelope: {
      id,
      title,
      short_code: shortCode,
      status: 'completed',
      original_pages: 4,
      original_sha256: '7a8afa33b5b077e0486f08fc301e6865caf7b8ea0ea256505df80ea6034c1261',
      sealed_sha256: 'cafebabedeadbeef1234567890abcdef1234567890abcdef1234567890abcdef',
      tc_version: '1',
      privacy_version: '1',
      sent_at: '2026-04-25T21:20:50Z',
      completed_at: '2026-04-25T21:21:08Z',
      expires_at: '2026-05-25T21:20:50Z',
    },
    signers: [
      {
        id: 's1',
        name: 'Ops Ops',
        email: 'ops@nromomentum.com',
        role: 'signer',
        status: 'completed',
        signed_at: '2026-04-25T21:20:55Z',
        declined_at: null,
      },
    ],
    events: [
      {
        id: 'e1',
        actor_kind: 'sender',
        event_type: 'created',
        signer_id: null,
        created_at: '2026-04-25T21:20:50Z',
      },
      {
        id: 'e2',
        actor_kind: 'system',
        event_type: 'sealed',
        signer_id: null,
        created_at: '2026-04-25T21:21:08Z',
      },
    ],
    chain_intact: opts.chainIntact,
    sealed_url: 'https://signed.example/sealed.pdf?token=presigned',
    audit_url: 'https://signed.example/audit.pdf?token=presigned',
  };
}

Given(
  'a sealed envelope is published at short code {string}',
  async ({ mockedApi }, shortCode: string) => {
    mockedApi.on('GET', new RegExp(`/verify/${shortCode}$`), {
      json: buildVerifyPayload(shortCode, { chainIntact: true }),
    });
  },
);

Given(
  'a sealed envelope with a broken audit chain is published at short code {string}',
  async ({ mockedApi }, shortCode: string) => {
    mockedApi.on('GET', new RegExp(`/verify/${shortCode}$`), {
      json: buildVerifyPayload(shortCode, { chainIntact: false }),
    });
  },
);

When('the user opens {string}', async ({ page }, path: string) => {
  await page.goto(path);
});

Then('the verify verdict heading announces the document is sealed', async ({ page }) => {
  await expect(
    page.getByRole('heading', { level: 1, name: /this document is sealed/i }),
  ).toBeVisible();
});

Then(
  'the sealed-PDF download link saves with a {string} filename',
  async ({ page }, suffix: string) => {
    const link = page.getByRole('link', { name: /^download$/i });
    await expect(link).toBeVisible();
    // The presence of the `download` attribute is the contract; the
    // filename inside it must end with the requested suffix so the
    // browser saves a friendly, document-named file rather than the
    // opaque presigned-URL path.
    const filename = await link.getAttribute('download');
    expect(filename).not.toBeNull();
    expect(filename!).toMatch(new RegExp(`${suffix.replace('.', '\\.')}$`, 'i'));
  },
);

Then(
  'the audit-PDF download link saves with a {string} filename',
  async ({ page }, suffix: string) => {
    const link = page.getByRole('link', { name: /audit pdf/i });
    await expect(link).toBeVisible();
    const filename = await link.getAttribute('download');
    expect(filename).not.toBeNull();
    expect(filename!).toMatch(new RegExp(`${suffix.replace('.', '\\.')}$`, 'i'));
  },
);

Then('the audit chain status badge reads {string}', async ({ page }, expected: string) => {
  const badge = page.getByLabel(/audit chain status/i);
  await expect(badge).toBeVisible();
  await expect(badge).toContainText(new RegExp(expected, 'i'));
});
