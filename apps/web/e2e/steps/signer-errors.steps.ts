import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When, Then } = createBdd(test);

Given('a sealed envelope that is {string}', async ({ signedEnvelope }, shape: string) => {
  signedEnvelope.seed(shape as 'expired' | 'signed' | 'invalid');
});

When('the recipient opens the signing link', async ({ signingEntryPage, signedEnvelope }) => {
  await signingEntryPage.goto(signedEnvelope.id);
});

Then('the recipient sees the {string} screen', async ({ signingEntryPage }, heading: string) => {
  await signingEntryPage.expectLinkState(new RegExp(`^${heading}$`, 'i'));
});
