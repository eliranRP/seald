import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When, Then } = createBdd(test);

/**
 * BDD step defs for `features/template-delete.feature`. Steps query by
 * accessible role/name only (rule 4.6). The mocks answer `GET /api/templates`
 * with one template so the list renders a card the sender can target;
 * DELETE and restore are mocked for Undo. The shared step
 * "the confirmation {string} is shown" lives in `sender-contacts.steps.ts`.
 */

function templateRow(name: string) {
  // Mirrors the wire shape the Nest TemplatesController returns
  // (`apps/web/src/features/templates/templatesApi.ts#ApiTemplate`).
  return {
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
  };
}

Given(
  'a signed-in sender on the templates page with a template named {string}',
  async ({ seededUser, mockedApi, templatesListPage }, name: string) => {
    await seededUser.signInAs();
    mockedApi.on('GET', /\/api\/templates(\?|$)/, { json: [templateRow(name)] });
    mockedApi.on('DELETE', /\/api\/templates\/tpl_qnda$/, { status: 204 });
    mockedApi.on('POST', /\/api\/templates\/tpl_qnda\/restore$/, { json: templateRow(name) });
    await templatesListPage.goto();
    await templatesListPage.expectVisible();
  },
);

When(
  'the sender clicks Delete on the {string} template',
  async ({ templatesListPage }, name: string) => {
    // Delete acts at once from the card menu; there is no confirm dialog.
    await templatesListPage.openDeleteModal(name);
  },
);

When('the sender taps Undo', async ({ page }) => {
  await page.getByRole('button', { name: 'Undo' }).click();
});

Then('the {string} template is still in the list', async ({ templatesListPage }, name: string) => {
  await templatesListPage.expectTemplateVisible(name);
});

Then(
  'the {string} template is no longer in the list',
  async ({ templatesListPage }, name: string) => {
    await templatesListPage.expectTemplateGone(name);
  },
);
