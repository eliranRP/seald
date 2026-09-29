import { expect, type Page } from '@playwright/test';

export class SigningDonePage {
  constructor(private readonly page: Page) {}

  async expectVisible(): Promise<void> {
    // The done screen records this signature. The sealed PDF is emailed
    // after every signer has signed, so the heading is "Signed."
    await expect(this.page.getByRole('heading', { name: /^signed\.$/i })).toBeVisible();
  }
}
