import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When, Then } = createBdd(test);

const STEPS_DIR = dirname(fileURLToPath(import.meta.url));
const SAMPLE_PDF = readFileSync(resolve(STEPS_DIR, '../fixtures/sample-1page.pdf'));

const CODE = 'scanE2eCode_scanE2eCode_scan0000';
const FUTURE = '2099-01-01T00:00:00.000Z';
// A 1x1 PNG: enough for the browser to decode, filter and re-encode a page.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

// Posted bodies, so a step can prove the phone sent a real PDF.
let postedBodies: Buffer[] = [];

Given(
  'a signed-in sender with a scan session that the phone has completed',
  async ({ seededUser, mockedApi }) => {
    await seededUser.signInAs();
    mockedApi.on('GET', /\/api\/templates(\?|$)/, { json: [] });
    mockedApi.on('GET', /\/api\/contacts(\?|$)/, { json: [] });
    mockedApi.on('POST', /\/api\/scan-sessions$/, {
      status: 201,
      json: { code: CODE, expires_at: FUTURE },
    });
    mockedApi.on('GET', new RegExp(`/api/scan-sessions/${CODE}$`), {
      json: { status: 'received', expires_at: FUTURE, page_count: 2 },
    });
    mockedApi.on('GET', new RegExp(`/api/scan-sessions/${CODE}/pdf$`), {
      body: SAMPLE_PDF,
      contentType: 'application/pdf',
    });
  },
);

When('the sender opens the scan page on a computer', async ({ page }) => {
  await page.goto('/scan');
});

Then('the scan dialog shows a QR code and a waiting message', async ({ page }) => {
  const dialog = page.getByRole('dialog', { name: 'Scan with your phone' });
  await expect(dialog.getByRole('img', { name: /qr code/i })).toBeVisible();
  await expect(dialog.getByText('Open your camera and point it here')).toBeVisible();
  await expect(dialog.getByText('Link works for 10 min')).toBeVisible();
});

Then('the scan dialog reports {string}', async ({ page }, text: string) => {
  await expect(page.getByRole('dialog').getByText(text)).toBeVisible({ timeout: 10_000 });
});

When('the sender continues with the scan', async ({ page }) => {
  await page.getByRole('button', { name: 'Continue' }).click();
});

Then('the editor opens for the scanned document', async ({ page }) => {
  await page.waitForURL(/\/document\/(?!new)[^/]+/);
});

Given('a scan link that is still open', async ({ mockedApi }) => {
  postedBodies = [];
  mockedApi.on('GET', new RegExp(`/api/scan-sessions/${CODE}/phone$`), {
    json: { status: 'pending', expires_at: FUTURE },
  });
  mockedApi.on('POST', new RegExp(`/api/scan-sessions/${CODE}/pdf$`), {
    status: 201,
    json: { page_count: 1 },
  });
});

Given('a scan link that has expired', async ({ mockedApi }) => {
  mockedApi.on('GET', new RegExp(`/api/scan-sessions/${CODE}/phone$`), {
    json: { status: 'expired', expires_at: FUTURE },
  });
});

When('the phone opens the scan link', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes(`/scan-sessions/${CODE}/pdf`)) {
      const body = req.postDataBuffer();
      if (body) postedBodies.push(body);
    }
  });
  await page.goto(`/scan/${CODE}`);
});

Then('the camera is reported as blocked', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Camera is blocked' })).toBeVisible();
});

When('the phone picks one photo', async ({ page }) => {
  await page
    .getByLabel('Choose photos')
    .setInputFiles({ name: 'page.png', mimeType: 'image/png', buffer: PNG_1X1 });
  await expect(page.getByRole('heading', { name: '1 page' })).toBeVisible();
});

When('the phone uses the scanned pages', async ({ page }) => {
  await page.getByRole('button', { name: 'Use 1 page' }).click();
});

Then('the phone is told the scan was sent to the computer', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Sent to your computer' })).toBeVisible();
});

Then('one scan PDF was posted', async () => {
  expect(postedBodies).toHaveLength(1);
  expect(postedBodies[0]?.includes(Buffer.from('%PDF-'))).toBe(true);
});

Then('the phone is told the link expired', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'This link expired' })).toBeVisible();
});
