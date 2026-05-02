import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When, Then } = createBdd(test);

/**
 * Steps for `sender-mobile.feature`. The viewport is locked to a 375x667
 * iPhone-SE-equivalent so the mobile-web routing gate
 * (`useIsMobileViewport` → `(max-width: 640px)`) fires and the SPA
 * redirects authed users to `/m/send` instead of `/documents`.
 */

// Real single-page PDF so pdf.js parses it successfully and the place
// step renders an interactive canvas. The previous `%PDF-1.4...` stub
// failed to parse and the editor never reached an interactive state.
// `__dirname` is undefined under the ESM playwright runtime — derive it
// from `import.meta.url`.
const STEPS_DIR = dirname(fileURLToPath(import.meta.url));
const SAMPLE_PDF = readFileSync(resolve(STEPS_DIR, '../fixtures/sample-1page.pdf'));

Given('a signed-in sender on a 375x667 phone', async ({ seededUser, mockedApi, page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await seededUser.signInAs();
  // Mirror the desktop sender-create stubs so the 5-call send path
  // (createEnvelope → upload → addSigner → placeFields → send) succeeds
  // without hitting the real backend.
  // Match the real `useSendEnvelope` 5-call sequence + payload shapes
  // declared in `apps/web/src/features/envelopes/envelopesApi.ts`. The
  // hook keys off `Envelope.id` / `short_code` / `EnvelopeSigner.id`,
  // so each mock must return a complete enough body to satisfy the
  // TypeScript surface even though we only assert the final screen.
  mockedApi.on('POST', /\/api\/envelopes$/, {
    json: {
      id: 'env_mobile_123',
      short_code: 'MOB-123',
      status: 'draft',
      title: 'mobile-sample',
      signers: [],
      fields: [],
    },
  });
  mockedApi.on('POST', /\/api\/envelopes\/[^/]+\/upload$/, {
    json: { pages: 1, sha256: 'deadbeef' },
  });
  // Static handler: id collisions are harmless because the place step
  // groups by signerId per *local* state, and the final POST /send only
  // needs the eventual envelope payload to validate.
  mockedApi.on('POST', /\/api\/envelopes\/[^/]+\/signers$/, {
    json: {
      id: 'sgn_1',
      name: 'Mock Signer',
      email: 'mock@example.com',
      color: '#4f46e5',
      status: 'awaiting',
      role: 'signatory',
    },
  });
  mockedApi.on('PUT', /\/api\/envelopes\/[^/]+\/fields$/, { json: [] });
  mockedApi.on('POST', /\/api\/envelopes\/[^/]+\/send$/, {
    json: {
      id: 'env_mobile_123',
      short_code: 'MOB-123',
      status: 'awaiting_signature',
      title: 'mobile-sample',
      signers: [],
      fields: [],
    },
  });
  mockedApi.on('GET', /\/api\/envelopes\/env_mobile_123$/, {
    json: {
      id: 'env_mobile_123',
      short_code: 'MOB-123',
      status: 'awaiting_signature',
      title: 'mobile-sample',
      signers: [],
      fields: [],
    },
  });
});

When('the sender visits the root', async ({ page }) => {
  await page.goto('/');
});

/**
 * Scenarios 2 (uploads → place step) doesn't list a navigation step in
 * the feature, but every step beyond the Background assumes we're on
 * `/m/send`. Auto-land before the first user action so we don't have
 * to bloat the .feature with a "visit /" line for every scenario.
 */
async function ensureOnMobileSend(page: import('@playwright/test').Page): Promise<void> {
  if (!/\/m\/send/.test(page.url())) {
    await page.goto('/m/send');
  }
}

When(
  'the sender taps {string} and picks a sample PDF',
  async ({ mobileSendPage, page }, _: string) => {
    await ensureOnMobileSend(page);
    await mobileSendPage.pickPdf('mobile-sample.pdf', SAMPLE_PDF);
  },
);

When('the sender taps Continue', async ({ mobileSendPage }) => {
  await mobileSendPage.tapContinue();
});

When('the sender taps {string}', async ({ mobileSendPage, page }, label: string) => {
  if (label === 'Add me as signer') {
    await mobileSendPage.tapAddMeAsSigner();
    return;
  }
  if (label === 'Next: place fields') {
    await mobileSendPage.tapNextPlaceFields();
    return;
  }
  if (label === 'Send for signature') {
    await mobileSendPage.tapSendForSignature();
    return;
  }
  if (label === 'Upload PDF') {
    // Covered by "the sender taps {string} and picks a sample PDF".
    return;
  }
  // Generic fallback — tap any role=button matching the label exactly.
  await page.getByRole('button', { name: new RegExp(`^${label}$`) }).click();
});

When('the sender taps the Signature chip', async ({ mobileSendPage }) => {
  await mobileSendPage.armChip('Signature');
});

When('the sender taps the page canvas', async ({ mobileSendPage }) => {
  await mobileSendPage.tapCanvasCentre();
});

When('the sender taps Apply on the signers sheet', async ({ mobileSendPage }) => {
  await mobileSendPage.tapApplyOnSignersSheet();
});

When('the sender taps Review', async ({ mobileSendPage }) => {
  await mobileSendPage.tapReview();
});

When('the sender drops a Signature field', async ({ mobileSendPage }) => {
  await mobileSendPage.armChip('Signature');
  await mobileSendPage.tapCanvasCentre();
});

Given(
  'the sender is on the place step with two signers configured',
  async ({ mobileSendPage, page }) => {
    await mobileSendPage.goto();
    await mobileSendPage.pickPdf('mobile-sample.pdf', SAMPLE_PDF);
    await mobileSendPage.tapContinue();
    await mobileSendPage.tapAddMeAsSigner();
    // Add a second signer via the bottom-sheet form so we have ≥2.
    await page.getByRole('button', { name: /^Add signer$/i }).click();
    await page.getByLabel(/Name/i).fill('Priya Kapoor');
    await page.getByLabel(/Email/i).fill('priya@example.com');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^Add$|^Save$/i })
      .click();
    await mobileSendPage.tapNextPlaceFields();
  },
);

Given('the sender is on the place step with one signer', async ({ mobileSendPage }) => {
  await mobileSendPage.goto();
  await mobileSendPage.pickPdf('mobile-sample.pdf', SAMPLE_PDF);
  await mobileSendPage.tapContinue();
  await mobileSendPage.tapAddMeAsSigner();
  await mobileSendPage.tapNextPlaceFields();
});

Then('the URL is \\/m\\/send', async ({ page }) => {
  await page.waitForURL(/\/m\/send$/);
  expect(page.url()).toMatch(/\/m\/send$/);
});

Then('the {string} heading is visible', async ({ page }, name: string) => {
  await expect(page.getByRole('heading', { name: new RegExp(name, 'i') })).toBeVisible();
});

Then('the {string} tile is visible inside the viewport', async ({ page }, name: string) => {
  const tile = page.getByLabel(new RegExp(`^${name}$`));
  await expect(tile).toBeVisible();
  await expect(tile).toBeInViewport();
});

Then('the place-fields step is visible', async ({ mobileSendPage }) => {
  await mobileSendPage.expectPlaceStepVisible();
});

Then('the field-type chips toolbar is visible', async ({ mobileSendPage }) => {
  await mobileSendPage.expectChipToolbarVisible();
});

Then('the assigned-signers sheet is open', async ({ mobileSendPage }) => {
  await mobileSendPage.expectAssignSignersSheetOpen();
});

Then('two single-signer Signature fields are placed on the page', async ({ mobileSendPage }) => {
  await mobileSendPage.expectSignatureFieldCount(2);
});

Then('the Sent screen is visible', async ({ mobileSendPage }) => {
  await mobileSendPage.expectSentScreen();
});
