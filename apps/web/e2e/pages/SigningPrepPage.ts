import { expect, type Page } from '@playwright/test';

export class SigningPrepPage {
  constructor(private readonly page: Page) {}

  async expectVisible(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: /prepare|consent/i })).toBeVisible();
  }

  async agreeAndContinue(): Promise<void> {
    await this.page.getByRole('checkbox', { name: /agree|consent/i }).check();
    await this.page.getByRole('button', { name: /continue|next/i }).click();
  }

  async decline(): Promise<void> {
    await this.page.getByRole('button', { name: /decline/i }).click();
    await this.page.getByRole('button', { name: /confirm/i }).click();
  }
}
