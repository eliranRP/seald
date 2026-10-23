import { expect, type Page } from '@playwright/test';

/** After Send there is no confirmation page: the Documents list shows a toast. */
export class SentConfirmationPage {
  constructor(private readonly page: Page) {}

  async expectVisible(): Promise<void> {
    await expect(this.page.getByRole('status').filter({ hasText: /sent/i })).toBeVisible();
  }
}
