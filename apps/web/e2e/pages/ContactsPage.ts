import { expect, type Page } from '@playwright/test';

export class ContactsPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/signers');
  }

  async expectVisible(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: /signers|contacts/i })).toBeVisible();
  }

  async addContact(name: string, email: string): Promise<void> {
    await this.page.getByRole('button', { name: /add (signer|contact)/i }).click();
    await this.page.getByLabel(/name/i).fill(name);
    await this.page.getByLabel(/email/i).fill(email);
    await this.page.getByRole('button', { name: /save/i }).click();
  }

  async deleteContact(name: string): Promise<void> {
    const row = this.page.getByRole('row', { name: new RegExp(name, 'i') });
    await row.getByRole('button', { name: /delete|remove/i }).click();
    await this.page.getByRole('button', { name: /confirm/i }).click();
  }

  async expectContactVisible(name: string): Promise<void> {
    await expect(this.page.getByText(new RegExp(name, 'i'))).toBeVisible();
  }
}
