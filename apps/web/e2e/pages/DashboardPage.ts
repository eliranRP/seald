import { expect, type Page } from '@playwright/test';

export class DashboardPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/documents');
  }

  async expectVisible(): Promise<void> {
    await expect(
      this.page.getByRole('heading', { name: /everything you've sent|documents/i }),
    ).toBeVisible();
  }

  async filterBy(status: string): Promise<void> {
    // Dashboard tabs: All / Awaiting you / Awaiting others / Completed /
    // Drafts. "awaiting" alone is ambiguous; map common shorthands to the
    // right tab so scenarios stay declarative.
    const map: Record<string, RegExp> = {
      awaiting: /awaiting others/i,
      'awaiting others': /awaiting others/i,
      'awaiting you': /awaiting you/i,
      completed: /^completed$/i,
      drafts: /^drafts$/i,
      all: /^all$/i,
    };
    const pattern = map[status.toLowerCase()] ?? new RegExp(status, 'i');
    await this.page.getByRole('tab', { name: pattern }).click();
  }

  async openEnvelope(title: string): Promise<void> {
    await this.page.getByRole('link', { name: new RegExp(title, 'i') }).click();
  }

  async startNewEnvelope(): Promise<void> {
    await this.page.getByRole('link', { name: /new|upload/i }).click();
  }
}
