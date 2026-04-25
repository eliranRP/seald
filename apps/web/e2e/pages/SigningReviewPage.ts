import { expect, type Page } from '@playwright/test';

export class SigningReviewPage {
  constructor(private readonly page: Page) {}

  async expectVisible(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: /review|finish/i })).toBeVisible();
  }

  async submit(): Promise<void> {
    await this.page.getByRole('button', { name: /finish|submit|complete/i }).click();
  }
}
