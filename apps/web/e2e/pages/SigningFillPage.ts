import { expect, type Page } from '@playwright/test';

export class SigningFillPage {
  constructor(private readonly page: Page) {}

  async expectVisible(): Promise<void> {
    // The fill page renders the doc-title via RecipientHeader and the
    // PageToolbar. Wait for the toolbar to be visible.
    await expect(this.page.getByRole('button', { name: /decline/i })).toBeVisible();
  }

  async drawSignature(): Promise<void> {
    // Click the first SignerField button (its accessible label is
    // "Sign here (required)"). Opens the SignatureCapture bottom sheet.
    await this.page
      .getByRole('button', { name: /sign here/i })
      .first()
      .click();
    // The sheet defaults to the "type" tab; just hit Apply.
    await this.page.getByRole('button', { name: /^apply$/i }).click();
  }

  async continueToReview(): Promise<void> {
    // The "Review & finish" button only appears once required fields are
    // filled. Use the icon-prefixed label.
    await this.page.getByRole('button', { name: /review.*finish/i }).click();
  }
}
