import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { When, Then } = createBdd(test);

/**
 * BDD step defs for `mobile-photo-capture.feature`.
 *
 * Two flows under coverage:
 *  1. Happy: pick a real single-page PDF → MWFile (confirm) → tap
 *     Continue → MWSigners.
 *  2. Reject: pick a 0-byte PDF → inline `role="alert"` mentioning the
 *     filename + the word "empty" (mirrors the vitest spec at
 *     apps/web/src/pages/MobileSendPage/MobileSendPage.test.tsx).
 *
 * Reuses the seeded-user 390x844 Background from
 * mobile-hamburger.steps.ts so a sender can land on /m/send via the
 * existing `the sender visits /m/send` step (sender-mobile-nav.steps.ts).
 *
 * `__dirname` isn't defined under the ESM playwright runtime — we
 * derive it from `import.meta.url` like the other fixture files.
 */

const STEPS_DIR = dirname(fileURLToPath(import.meta.url));
const SAMPLE_PDF = readFileSync(resolve(STEPS_DIR, '../fixtures/sample-1page.pdf'));

When('the sender uploads the sample PDF named {string}', async ({ page }, filename: string) => {
  await page.getByLabel('PDF file').setInputFiles({
    name: filename,
    mimeType: 'application/pdf',
    buffer: SAMPLE_PDF,
  });
});

When('the sender uploads an empty PDF named {string}', async ({ page }, filename: string) => {
  // 0-byte buffer mirrors `emptyFile()` in MobileSendPage.test.tsx.
  await page.getByLabel('PDF file').setInputFiles({
    name: filename,
    mimeType: 'application/pdf',
    buffer: Buffer.alloc(0),
  });
});

Then(
  'the file-confirm step shows the picked filename {string}',
  async ({ page }, filename: string) => {
    // MWFile renders the filename in a `<Name>` element. The stepper
    // label flips to "Confirm the file" once the screen mounts; wait
    // on the more specific filename text so we don't race the stepper.
    await expect(page.getByText(filename, { exact: false }).first()).toBeVisible();
  },
);

Then('the place-fields stepper label {string} is visible', async ({ page }, label: string) => {
  // STEP_LABELS in MobileSendPage.tsx renders as the MWStep label;
  // the visible copy is the exact string.
  await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
});

Then('an inline alert mentions {string}', async ({ page }, fragment: string) => {
  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(fragment);
});

Then('the inline alert mentions {string}', async ({ page }, fragment: string) => {
  await expect(page.getByRole('alert')).toContainText(fragment);
});

Then('the file-confirm step is not shown', async ({ page }) => {
  // The MWFile screen renders the literal "Confirm the file" stepper
  // label. If it ever shows, the empty-PDF guard regressed.
  await expect(page.getByText(/confirm the file/i)).toHaveCount(0);
});
