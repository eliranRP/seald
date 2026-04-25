import { expect, type Page } from '@playwright/test';

export class SigningFillPage {
  constructor(private readonly page: Page) {}

  async expectVisible(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: /fill|sign here/i })).toBeVisible();
  }

  async drawSignature(): Promise<void> {
    await this.page
      .getByRole('button', { name: /signature|sign/i })
      .first()
      .click();
    await this.page.getByRole('button', { name: /apply|use/i }).click();
  }

  async continueToReview(): Promise<void> {
    await this.page.getByRole('button', { name: /review|continue/i }).click();
  }
}
