import { expect, type Page } from '@playwright/test';

export class DashboardPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    // Append the `status=all` sentinel so tests see every seeded envelope
    // (the dashboard's first-visit default narrows to the actionable
    // inbox: Awaiting you + Awaiting others). Tests that need to assert
    // the actionable-inbox default should call `gotoDefault()` instead.
    await this.page.goto('/documents?status=all');
  }

  async gotoDefault(): Promise<void> {
    await this.page.goto('/documents');
  }

  async expectVisible(): Promise<void> {
    await expect(
      this.page.getByRole('heading', { name: /everything you've sent|documents/i }),
    ).toBeVisible();
  }

  async filterBy(status: string): Promise<void> {
    // The dashboard now reads filter state from `?status=…` (replacing
    // the old tab UI). Push the URL directly so tests stay independent
    // of the chip popover's checkbox UX.
    const map: Record<string, string> = {
      awaiting: 'awaiting_others',
      'awaiting others': 'awaiting_others',
      'awaiting you': 'awaiting_you',
      completed: 'sealed',
      sealed: 'sealed',
      drafts: 'draft',
      draft: 'draft',
      declined: 'declined',
      all: 'all',
    };
    const slug = map[status.toLowerCase()] ?? status.toLowerCase();
    await this.page.goto(`/documents?status=${slug}`);
  }

  async openEnvelope(title: string): Promise<void> {
    await this.page.getByRole('link', { name: new RegExp(title, 'i') }).click();
  }

  async startNewEnvelope(): Promise<void> {
    await this.page.getByRole('link', { name: /new|upload/i }).click();
  }
}
