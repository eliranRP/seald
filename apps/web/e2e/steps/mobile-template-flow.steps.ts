import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When, Then } = createBdd(test);

/**
 * BDD step defs for `mobile-template-flow.feature`.
 *
 * The "From a template" tile is the only mobile-side path to the
 * templates list (per PR #111 the hamburger no longer carries a
 * Templates entry). Picking a template card on /templates navigates
 * to /templates/:id/use, which is the shared (desktop+mobile) flow.
 *
 * `When the sender visits /m/send`, `When the sender taps the "X"
 * tile`, and `Then the URL is /templates` are reused from
 * sender-mobile-nav.steps.ts. We only register what's new here.
 */

Given('a template named {string} is available', async ({ mockedApi }, name: string) => {
  // Wire shape mirrors `apps/web/src/features/templates/templatesApi.ts#ApiTemplate`
  // — `title`, not `name`. Without `title` the per-card aria-label
  // would be empty and accessible-role queries would fail.
  //
  // We use `override()` (not `on()`) because the
  // `Given a signed-in sender on a 390x844 phone` step in
  // mobile-hamburger.steps.ts pre-registers an empty templates list
  // for the hamburger scenarios — without overriding, the empty
  // handler would win (first match in `MockedApi`).
  mockedApi.override('GET', /\/api\/templates(\?|$)/, {
    json: [
      {
        id: 'tpl_qnda',
        owner_id: '00000000-0000-4000-8000-000000000a11',
        title: name,
        description: 'Mutual NDA used quarterly with vendor onboarding.',
        cover_color: '#EEF2FF',
        field_layout: [],
        tags: ['legal'],
        last_signers: [],
        has_example_pdf: false,
        uses_count: 3,
        last_used_at: '2026-04-15T10:00:00Z',
        created_at: '2026-04-01T10:00:00Z',
        updated_at: '2026-05-02T10:00:00Z',
      },
    ],
  });
});

When('the sender taps the {string} template card', async ({ page }, name: string) => {
  // TemplateCard exposes the per-card "Use" button with
  // aria-label="Use <name>". Querying the Use button (rather than
  // the card root) is more deterministic — the card root has the
  // template name as accessible name but other affordances inside
  // it can absorb the click event.
  await page
    .getByRole('button', { name: new RegExp(`^Use ${name}$`, 'i') })
    .first()
    .click();
});

Then('the URL is on the use-template flow', async ({ page }) => {
  // /templates/<id>/use is the shared (desktop+mobile) UseTemplatePage
  // route — see apps/web/src/AppRoutes.tsx. We intentionally don't pin
  // the id since templates are listed by mocked GET /api/templates and
  // the list -> use card click selects the active id.
  await page.waitForURL(/\/templates\/[^/]+\/use/);
  expect(page.url()).toMatch(/\/templates\/[^/]+\/use/);
});
