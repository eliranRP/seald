import { expect, type Page } from '@playwright/test';

export class SigningDonePage {
  constructor(private readonly page: Page) {}

  async expectVisible(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: /done|completed|thank/i })).toBeVisible();
  }
}
