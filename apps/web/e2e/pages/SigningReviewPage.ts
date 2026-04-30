import { expect, type Page } from '@playwright/test';

export class SigningReviewPage {
  constructor(private readonly page: Page) {}

  async expectVisible(): Promise<void> {
    await expect(this.page.getByRole('button', { name: /sign and submit/i })).toBeVisible();
  }

  async submit(): Promise<void> {
    // T-15: review now requires an explicit intent-to-sign affirmation
    // before the submit button enables.
    await this.page.getByRole('checkbox', { name: /intend to sign this document/i }).check();
    await this.page.getByRole('button', { name: /sign and submit/i }).click();
  }
}
