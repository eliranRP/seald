import { expect, type Page } from '@playwright/test';

export class SentConfirmationPage {
  constructor(private readonly page: Page) {}

  async expectVisible(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: /sent|on its way/i })).toBeVisible();
  }
}
