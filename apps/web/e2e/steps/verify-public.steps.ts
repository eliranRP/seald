import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

// IMPORTANT: scope the handler regex to `/api/verify/...` so it only matches
// the verifyApiClient XHR (baseURL = `http://127.0.0.1:5173/api`). A bare
// `/verify/${shortCode}$` would also match the browser's own SPA navigation
// to `http://127.0.0.1:5173/verify/${shortCode}` — and `MockedApi` would
// fulfill that page request with the canned JSON, blanking the SPA.
Given(
  'a sealed envelope is published at short code {string}',
  async ({ mockedApi }, shortCode: string) => {
    mockedApi.on('GET', new RegExp(`/api/verify/${shortCode}$`), {
      json: buildVerifyPayload(shortCode, { chainIntact: true }),
    });
  },
);

Given(
  'a sealed envelope with a broken audit chain is published at short code {string}',
  async ({ mockedApi }, shortCode: string) => {
    mockedApi.on('GET', new RegExp(`/api/verify/${shortCode}$`), {
      json: buildVerifyPayload(shortCode, { chainIntact: false }),
    });
  },
);

When('the user opens {string}', async ({ page }, path: string) => {
  await page.goto(path);
});

Then('the verify verdict heading announces the document is sealed', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1, name: 'Authentic' })).toBeVisible();
});

Then(
  'the sealed-PDF download link saves with a {string} filename',
  async ({ page }, suffix: string) => {
    const link = page.getByRole('link', { name: /^sealed pdf$/i });
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
    const link = page.getByRole('link', { name: /audit trail pdf/i });
    await expect(link).toBeVisible();
    const filename = await link.getAttribute('download');
    expect(filename).not.toBeNull();
    expect(filename!).toMatch(new RegExp(`${suffix.replace('.', '\\.')}$`, 'i'));
  },
);

/**
 * Reads `theme.font.size` from the theme source so the assertion stays
 * tied to the token. Playwright's e2e project cannot import `src/`
 * (that file sits outside the e2e rootDir).
 */
function headingTokenSize(name: string): string {
  if (!['x4l', 'x5l', 'body'].includes(name)) {
    throw new Error(`unsupported heading size token: ${name}`);
  }
  const source = readFileSync(join(process.cwd(), 'src/styles/theme.ts'), 'utf8');
  const match = new RegExp(`\\b${name}:\\s*'(\\d+px)'`).exec(source);
  const px = match?.[1];
  if (px === undefined) {
    throw new Error(`theme.font.size.${name} is missing from theme.ts`);
  }
  return px;
}

When('the viewport is set to a 640x900 window', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 900 });
});

When('the viewport is set to a 641x900 window', async ({ page }) => {
  await page.setViewportSize({ width: 641, height: 900 });
});

When('the viewport is set to a 1440x900 desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

Then(
  'the verify verdict heading font size is the {string} token',
  async ({ page }, token: string) => {
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    await expect(heading).toHaveCSS('font-size', headingTokenSize(token));
  },
);

Then(
  'the verify document title font size is the {string} token',
  async ({ page }, token: string) => {
    const title = page.getByRole('heading', { level: 2 });
    await expect(title).toBeVisible();
    await expect(title).toHaveCSS('font-size', headingTokenSize(token));
  },
);

Then('the verify page does not overflow horizontally', async ({ page }) => {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
});

Then('the verify checks show {string}', async ({ page }, expected: string) => {
  // The chips row is a labelled div, not a form control, so getByLabel
  // does not resolve it; an attribute selector does.
  const checks = page.locator('[aria-label="Checks"]');
  await expect(checks).toBeVisible();
  await expect(checks).toContainText(new RegExp(expected, 'i'));
});

When('the user opens the technical details', async ({ page }) => {
  await page.getByRole('button', { name: /technical details/i }).click();
});

Then('the verify verdict word reads {string}', async ({ page }, word: string) => {
  await expect(page.getByRole('heading', { level: 1, name: word })).toBeVisible();
  await expect(page.getByRole('button', { name: /technical details/i })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
});

Then('the verify entry page asks for a document code', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1, name: 'Verify a document' })).toBeVisible();
  await expect(page.getByLabel('Verification code')).toBeVisible();
});

Then('the Verify button is disabled until 13 characters are typed', async ({ page }) => {
  const verify = page.getByRole('button', { name: 'Verify', exact: true });
  await expect(verify).toBeDisabled();
  await page.getByLabel('Verification code').fill('PuBLicSm0kE1');
  await expect(verify).toBeDisabled();
  await page.getByLabel('Verification code').fill('PuBLicSm0kE12');
  await expect(verify).toBeEnabled();
});
