import { expect, type Page } from '@playwright/test';

/**
 * Page Object for `/templates` (TemplatesListPage). Mirrors the rest of
 * the e2e Page Objects: thin wrapper over `page` exposing semantic
 * affordances (rule 4.6 — query by accessible role/name only).
 *
 * Scope is intentionally narrow — only the actions the templates BDD
 * scenarios in this folder exercise:
 *   - navigating to the page
 *   - opening the delete-confirmation modal for a named template
 *   - asserting the modal is open / closed
 *   - asserting a template is still listed (used by the Bug A regression
 *     scenario to prove that pressing Escape did not delete it)
 */
export class TemplatesListPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/templates');
  }

  async expectVisible(): Promise<void> {
    // Page header always renders the "Create a new template" CreateCard,
    // even when the list is empty.
    await expect(this.page.getByRole('button', { name: /create a new template/i })).toBeVisible();
  }

  /** Opens the delete-confirmation modal by clicking the row's Delete button. */
  async openDeleteModal(name: string): Promise<void> {
    await this.page
      .getByRole('button', { name: new RegExp(`^delete ${name}$`, 'i') })
      .first()
      .click();
  }

  async expectDeleteModalOpen(name: string): Promise<void> {
    await expect(
      this.page.getByRole('dialog', { name: new RegExp(`delete ${name}`, 'i') }),
    ).toBeVisible();
  }

  async expectDeleteModalClosed(name: string): Promise<void> {
    await expect(
      this.page.getByRole('dialog', { name: new RegExp(`delete ${name}`, 'i') }),
    ).toHaveCount(0);
  }

  async expectTemplateVisible(name: string): Promise<void> {
    // Template names render inside an `aria-labelledby="tpl-name-..."`
    // article — querying by accessible name picks that up.
    await expect(this.page.getByRole('article', { name: new RegExp(name, 'i') })).toBeVisible();
  }
}
