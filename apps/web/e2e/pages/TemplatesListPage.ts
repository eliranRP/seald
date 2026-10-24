import { expect, type Page } from '@playwright/test';

/**
 * Page Object for `/templates` (TemplatesListPage). Thin wrapper over `page`
 * exposing semantic affordances (rule 4.6: query by accessible role/name).
 *
 * Scope is the actions the templates BDD scenarios exercise: opening the
 * page, a card's ⋯ menu, the delete confirmation (and its Undo toast), and
 * checking a template is still listed.
 */
export class TemplatesListPage {
  constructor(readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/templates');
  }

  async expectVisible(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: 'Templates', level: 1 })).toBeVisible();
  }

  /** Opens the delete confirmation from the card's ⋯ menu. */
  async openDeleteModal(name: string): Promise<void> {
    await this.page.getByRole('button', { name: `More for ${name}` }).click();
    await this.page.getByRole('menuitem', { name: 'Delete' }).click();
  }

  async confirmDelete(): Promise<void> {
    await this.page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
  }

  async expectDeleteModalOpen(name: string): Promise<void> {
    await expect(this.page.getByRole('alertdialog', { name: `Delete ${name}?` })).toBeVisible();
  }

  async expectDeleteModalClosed(name: string): Promise<void> {
    await expect(this.page.getByRole('alertdialog', { name: `Delete ${name}?` })).toHaveCount(0);
  }

  async expectTemplateVisible(name: string): Promise<void> {
    // The card is one button named by the template name.
    await expect(this.page.getByRole('button', { name, exact: true }).first()).toBeVisible();
  }

  async expectTemplateGone(name: string): Promise<void> {
    await expect(this.page.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
}
