import { test as base } from 'playwright-bdd';
import { CookieConsentFixture } from './cookieConsent';
import { MockedApi } from './mockedApi';
import { SeededUserFixture } from './seededUser';
import { SignedEnvelopeFixture } from './signedEnvelope';
import { FixedNowFixture } from './fixedNow';
import { SignInPage } from '../pages/SignInPage';
import { SignUpPage } from '../pages/SignUpPage';
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage';
import { DashboardPage } from '../pages/DashboardPage';
import { UploadPage } from '../pages/UploadPage';
import { DocumentEditorPage } from '../pages/DocumentEditorPage';
import { SentConfirmationPage } from '../pages/SentConfirmationPage';
import { ContactsPage } from '../pages/ContactsPage';
import { SigningEntryPage } from '../pages/SigningEntryPage';
import { SigningPrepPage } from '../pages/SigningPrepPage';
import { SigningFillPage } from '../pages/SigningFillPage';
import { SigningReviewPage } from '../pages/SigningReviewPage';
import { SigningDonePage } from '../pages/SigningDonePage';
import { SigningDeclinedPage } from '../pages/SigningDeclinedPage';

/**
 * Composed BDD test object — extends playwright-bdd's `test` with the
 * seald-specific fixtures (rule 1.3) + every Page Object as a per-scenario
 * instance (rule 4.6). Steps in `e2e/steps/*.ts` import this `test` and
 * pass it to `createBdd(test)` to get the typed Given/When/Then bindings.
 *
 * Fixture composition order (Playwright resolves these on demand, but the
 * intended dependency graph is):
 *   1. `page` (Playwright built-in) — shared by every wrapper below.
 *   2. `fixedNow` → installs deterministic Date / performance overrides via
 *      `page.addInitScript`, MUST run before any navigation.
 *   3. `mockedApi` → installs a single `page.route(...)` interceptor before
 *      any request leaves the browser; reset between scenarios.
 *   4. `seededUser` → seeds Supabase auth state into localStorage (still via
 *      `addInitScript`, so it lands before app code runs).
 *   5. `signedEnvelope` → builds on `mockedApi` to register the per-scenario
 *      sign-flow stubs.
 *   6. `…Page` Page Objects → bare wrappers around `page`, side-effect free.
 *
 * Steps that need the timeline frozen, mocks ready, and a seeded user
 * should request all four fixtures in their `Given` clause; Playwright's
 * fixture resolver guarantees they're set up in the order above.
 */
type Fixtures = {
  cookieConsent: CookieConsentFixture;
  mockedApi: MockedApi;
  seededUser: SeededUserFixture;
  signedEnvelope: SignedEnvelopeFixture;
  fixedNow: FixedNowFixture;
  signInPage: SignInPage;
  signUpPage: SignUpPage;
  forgotPasswordPage: ForgotPasswordPage;
  dashboardPage: DashboardPage;
  uploadPage: UploadPage;
  documentEditorPage: DocumentEditorPage;
  sentConfirmationPage: SentConfirmationPage;
  contactsPage: ContactsPage;
  signingEntryPage: SigningEntryPage;
  signingPrepPage: SigningPrepPage;
  signingFillPage: SigningFillPage;
  signingReviewPage: SigningReviewPage;
  signingDonePage: SigningDonePage;
  signingDeclinedPage: SigningDeclinedPage;
};

export const test = base.extend<Fixtures>({
  // Cookie-consent banner is force-disabled in every BDD scenario via
  // `addInitScript` (T-30). The fixture is `auto: true` so step
  // definitions don't have to opt in — the banner never overlays form
  // fields the existing scenarios don't expect. Specs that *want* the
  // banner (e.g. the dedicated cookie-consent flow) should not import
  // from this fixture file; they import the bare `@playwright/test`.
  cookieConsent: [
    async ({ page }, use) => {
      const fixture = new CookieConsentFixture(page);
      await fixture.disable();
      await use(fixture);
    },
    { auto: true },
  ],
  // Network mocks are auto-installed before every test so step defs only
  // call `mockedApi.on(...)` to register a handler — no manual install.
  mockedApi: async ({ page }, use) => {
    const api = new MockedApi(page);
    await api.install();
    await use(api);
    api.reset();
  },
  seededUser: async ({ page }, use) => {
    await use(new SeededUserFixture(page));
  },
  signedEnvelope: async ({ mockedApi }, use) => {
    await use(new SignedEnvelopeFixture(mockedApi));
  },
  fixedNow: async ({ page }, use) => {
    const fixture = new FixedNowFixture(page);
    await fixture.install();
    await use(fixture);
  },
  signInPage: async ({ page }, use) => {
    await use(new SignInPage(page));
  },
  signUpPage: async ({ page }, use) => {
    await use(new SignUpPage(page));
  },
  forgotPasswordPage: async ({ page }, use) => {
    await use(new ForgotPasswordPage(page));
  },
  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },
  uploadPage: async ({ page }, use) => {
    await use(new UploadPage(page));
  },
  documentEditorPage: async ({ page }, use) => {
    await use(new DocumentEditorPage(page));
  },
  sentConfirmationPage: async ({ page }, use) => {
    await use(new SentConfirmationPage(page));
  },
  contactsPage: async ({ page }, use) => {
    await use(new ContactsPage(page));
  },
  signingEntryPage: async ({ page }, use) => {
    await use(new SigningEntryPage(page));
  },
  signingPrepPage: async ({ page }, use) => {
    await use(new SigningPrepPage(page));
  },
  signingFillPage: async ({ page }, use) => {
    await use(new SigningFillPage(page));
  },
  signingReviewPage: async ({ page }, use) => {
    await use(new SigningReviewPage(page));
  },
  signingDonePage: async ({ page }, use) => {
    await use(new SigningDonePage(page));
  },
  signingDeclinedPage: async ({ page }, use) => {
    await use(new SigningDeclinedPage(page));
  },
});
