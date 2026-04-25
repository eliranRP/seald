import { expect, type Page } from '@playwright/test';

export class DocumentEditorPage {
  constructor(private readonly page: Page) {}

  async expectVisible(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: /document|editor/i })).toBeVisible();
  }

  async addSigner(name: string, email: string): Promise<void> {
    await this.page.getByRole('button', { name: /add signer/i }).click();
    await this.page.getByLabel(/name/i).fill(name);
    await this.page.getByLabel(/email/i).fill(email);
    await this.page.getByRole('button', { name: /save|add/i }).click();
  }

  async placeSignatureField(): Promise<void> {
    await this.page.getByRole('button', { name: /signature field/i }).click();
  }

  async send(): Promise<void> {
    await this.page.getByRole('button', { name: /send|finalize/i }).click();
  }

  async cancelEnvelope(): Promise<void> {
    await this.page.getByRole('button', { name: /cancel envelope/i }).click();
    await this.page.getByRole('button', { name: /confirm/i }).click();
  }
}
