import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When, Then } = createBdd(test);

Given('a sealed envelope ready for signing', async ({ signedEnvelope }) => {
  signedEnvelope.seed('happy');
});

When(
  'the recipient signs and submits the envelope',
  async ({
    signingEntryPage,
    signingPrepPage,
    signingFillPage,
    signingReviewPage,
    signedEnvelope,
  }) => {
    await signingEntryPage.goto(signedEnvelope.id);
    await signingEntryPage.startSigning();
    await signingPrepPage.agreeAndContinue();
    await signingFillPage.drawSignature();
    await signingFillPage.continueToReview();
    await signingReviewPage.submit();
  },
);

Then('the signing-done page is shown', async ({ signingDonePage }) => {
  await signingDonePage.expectVisible();
});
