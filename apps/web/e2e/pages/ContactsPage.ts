import { expect, type Page } from '@playwright/test';

export class ContactsPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/signers');
  }

  async expectVisible(): Promise<void> {
    await expect(this.page.getByRole('button', { name: /^add signer$/i })).toBeVisible();
  }

  async addContact(name: string, email: string): Promise<void> {
    // The page-header "Add signer" button opens an aria-labelled dialog
    // with Name + Email TextFields and an "Add signer" submit button.
    await this.page
      .getByRole('button', { name: /^add signer$/i })
      .first()
      .click();
    const dialog = this.page.getByRole('dialog', { name: /add signer/i });
    await dialog.getByRole('textbox', { name: /^name$/i }).fill(name);
    await dialog.getByRole('textbox', { name: /^email$/i }).fill(email);
    await dialog.getByRole('button', { name: /^add signer$/i }).click();
  }

  async deleteContact(name: string): Promise<void> {
    await this.page.getByRole('button', { name: new RegExp(`^delete ${name}$`, 'i') }).click();
    await this.page.getByRole('button', { name: /confirm|delete/i }).click();
  }

  async expectContactVisible(name: string): Promise<void> {
    await expect(this.page.getByText(new RegExp(name, 'i')).first()).toBeVisible();
  }
}
