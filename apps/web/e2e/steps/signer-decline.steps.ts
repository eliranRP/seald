import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

// Reuses `Given a sealed envelope ready for signing` defined in
// signer-happy.steps.ts (rule 5.1 — share steps across feature files when
// the wording is genuinely the same domain concept).
const { When, Then } = createBdd(test);

When(
  'the recipient declines the envelope',
  async ({ signingEntryPage, signingPrepPage, signedEnvelope }) => {
    await signingEntryPage.goto(signedEnvelope.id);
    await signingEntryPage.startSigning();
    await signingPrepPage.decline();
  },
);

Then('the signing-declined page is shown', async ({ signingDeclinedPage }) => {
  await signingDeclinedPage.expectVisible();
});
