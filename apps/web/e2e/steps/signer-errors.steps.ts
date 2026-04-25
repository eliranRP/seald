import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When, Then } = createBdd(test);

Given('a sealed envelope that is {string}', async ({ signedEnvelope }, shape: string) => {
  signedEnvelope.seed(shape as 'expired' | 'burned');
});

When('the recipient opens the signing link', async ({ signingEntryPage, signedEnvelope }) => {
  await signingEntryPage.goto(signedEnvelope.id);
});

Then('the recipient sees an {string} notice', async ({ signingEntryPage }, label: string) => {
  await signingEntryPage.expectErrorState(new RegExp(label, 'i'));
});

Then('the recipient sees a {string} notice', async ({ signingEntryPage }, label: string) => {
  await signingEntryPage.expectErrorState(new RegExp(label, 'i'));
});
