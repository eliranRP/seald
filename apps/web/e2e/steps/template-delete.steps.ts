import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When, Then } = createBdd(test);

/**
 * BDD step defs for `features/template-delete.feature`. Covers Bug A
 * (Escape must dismiss the delete-confirmation modal — WCAG 2.1.2 No
 * Keyboard Trap). Steps query by accessible role/name only (rule 4.6).
 *
 * The mocks build a single `GET /api/templates` response with one
 * template so the templates list renders a card the user can target.
 * No DELETE handler is registered: if the modal were ever confirmed,
 * the test would surface "no mock registered" and fail loudly — but the
 * flow under test deliberately *dismisses* the modal, so the DELETE
 * must never fire.
 */

Given(
  'a signed-in sender on the templates page with a template named {string}',
  async ({ seededUser, mockedApi, templatesListPage }, name: string) => {
    await seededUser.signInAs();
    // Mirror the wire shape the Nest TemplatesController returns
    // (`apps/web/src/features/templates/templatesApi.ts#ApiTemplate`).
    // Crucially: `title` (not `name`) — the SPA maps `title` → summary.name,
    // and the per-card aria-label is `Delete ${name}` — without `title`
    // the Delete button's accessible name would be empty.
    mockedApi.on('GET', /\/api\/templates(\?|$)/, {
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
    await templatesListPage.goto();
    await templatesListPage.expectVisible();
  },
);

When(
  'the sender clicks Delete on the {string} template',
  async ({ templatesListPage }, name: string) => {
    await templatesListPage.openDeleteModal(name);
  },
);

When('the sender presses Escape', async ({ page }) => {
  await page.keyboard.press('Escape');
});

Then(
  'the delete confirmation for {string} is open',
  async ({ templatesListPage }, name: string) => {
    await templatesListPage.expectDeleteModalOpen(name);
  },
);

Then(
  'the delete confirmation for {string} is closed',
  async ({ templatesListPage }, name: string) => {
    await templatesListPage.expectDeleteModalClosed(name);
  },
);

Then('the {string} template is still in the list', async ({ templatesListPage }, name: string) => {
  await templatesListPage.expectTemplateVisible(name);
});
