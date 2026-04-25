import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When, Then } = createBdd(test);

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
    const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF', 'utf8');
    await uploadPage.uploadPdf('sample.pdf', pdfBytes);
    await documentEditorPage.addSigner(name, email);
    await documentEditorPage.placeSignatureField();
    await documentEditorPage.send();
  },
);

Then('the sent confirmation page is shown', async ({ sentConfirmationPage }) => {
  await sentConfirmationPage.expectVisible();
});
