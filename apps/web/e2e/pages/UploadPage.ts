import { expect, type Page } from '@playwright/test';

export class UploadPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/document/new');
  }

  async uploadPdf(filename: string, contents: Buffer): Promise<void> {
    await this.page.getByLabel(/upload|choose file|pdf/i).setInputFiles({
      name: filename,
      mimeType: 'application/pdf',
      buffer: contents,
    });
  }

  async expectVisible(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: /upload|new document/i })).toBeVisible();
  }
}
