import { expect, type Page } from '@playwright/test';

export class SigningPrepPage {
  constructor(private readonly page: Page) {}

  async expectVisible(): Promise<void> {
    await expect(this.page.getByRole('button', { name: /start signing/i })).toBeVisible();
  }

  async agreeAndContinue(): Promise<void> {
    await this.page.getByRole('checkbox', { name: /agree to electronic signatures/i }).check();
    await this.page.getByRole('button', { name: /start signing/i }).click();
  }

  async decline(): Promise<void> {
    // Decline link triggers a native window.confirm() — Playwright
    // auto-accepts when we register a one-shot dialog handler before
    // clicking.
    this.page.once('dialog', (d) => {
      void d.accept();
    });
    await this.page.getByRole('button', { name: /decline this request/i }).click();
  }
}
