import { expect, type Page } from '@playwright/test';

export class SigningDeclinedPage {
  constructor(private readonly page: Page) {}

  async expectVisible(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: /declined/i })).toBeVisible();
  }
}
