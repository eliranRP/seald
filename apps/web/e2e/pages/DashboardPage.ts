import { expect, type Page } from '@playwright/test';

export class DashboardPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/documents');
  }

  async expectVisible(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: /documents/i })).toBeVisible();
  }

  async filterBy(status: string): Promise<void> {
    await this.page.getByRole('tab', { name: new RegExp(status, 'i') }).click();
  }

  async openEnvelope(title: string): Promise<void> {
    await this.page.getByRole('link', { name: new RegExp(title, 'i') }).click();
  }

  async startNewEnvelope(): Promise<void> {
    await this.page.getByRole('link', { name: /new|upload/i }).click();
  }
}
