import { expect, type Page } from '@playwright/test';

export class SigningEntryPage {
  constructor(private readonly page: Page) {}

  async goto(envelopeId: string): Promise<void> {
    await this.page.goto(`/sign/${envelopeId}`);
  }

  async expectVisible(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: /sign|review/i })).toBeVisible();
  }

  async startSigning(): Promise<void> {
    await this.page.getByRole('button', { name: /start|begin|continue/i }).click();
  }

  async expectErrorState(label: RegExp): Promise<void> {
    await expect(this.page.getByText(label)).toBeVisible();
  }
}
