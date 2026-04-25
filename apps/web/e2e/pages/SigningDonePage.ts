import { expect, type Page } from '@playwright/test';

export class SigningDonePage {
  constructor(private readonly page: Page) {}

  async expectVisible(): Promise<void> {
    // /sign/:envId/done renders <h1>Seald.</h1>
    await expect(this.page.getByRole('heading', { name: /seald\.?/i })).toBeVisible();
  }
}
