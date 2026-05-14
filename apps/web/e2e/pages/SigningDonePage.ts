import { expect, type Page } from '@playwright/test';

export class SigningDonePage {
  constructor(private readonly page: Page) {}

  async expectVisible(): Promise<void> {
    // /sign/:envId/done renders <h1>Signed and sealed.</h1> after the
    // PR-4 hero/copy audit (was <h1>Seald.</h1>). Item 17 in the audit:
    // verb-led affirmation replaces the brand-mark wordmark so the
    // legal completion screen tells the signer *what just happened*.
    await expect(this.page.getByRole('heading', { name: /signed and sealed/i })).toBeVisible();
  }
}
