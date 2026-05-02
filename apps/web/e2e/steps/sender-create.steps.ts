import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When, Then } = createBdd(test);

// Real single-page PDF so pdf.js parses it and the editor canvas
// reaches an interactive state. The earlier `%PDF-1.4...` stub didn't
// parse and the editor stayed in its loading shell.
const STEPS_DIR = dirname(fileURLToPath(import.meta.url));
const SAMPLE_PDF = readFileSync(resolve(STEPS_DIR, '../fixtures/sample-1page.pdf'));

Given(
  'a signed-in sender on the new-document page',
  async ({ seededUser, mockedApi, uploadPage }) => {
    await seededUser.signInAs();
    mockedApi.on('POST', /\/api\/envelopes$/, {
      json: { id: 'env_new_123', status: 'draft' },
    });
    mockedApi.on('POST', /\/api\/envelopes\/[^/]+\/send$/, {
      json: { ok: true, status: 'awaiting_signature' },
    });
    await uploadPage.goto();
  },
);

When(
  'the sender uploads a sample PDF and adds signer {string} {string}',
  async ({ uploadPage, documentEditorPage }, name: string, email: string) => {
    await uploadPage.uploadPdf('sample.pdf', SAMPLE_PDF);
    await documentEditorPage.addSigner(name, email);
    await documentEditorPage.placeSignatureField();
    await documentEditorPage.send();
  },
);

Then('the sent confirmation page is shown', async ({ sentConfirmationPage }) => {
  await sentConfirmationPage.expectVisible();
});
