import { expect, type Page } from '@playwright/test';

export class DashboardPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/documents');
  }

  async gotoDefault(): Promise<void> {
    await this.page.goto('/documents');
  }

  async expectVisible(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: /^documents$/i })).toBeVisible();
  }

  async filterBy(status: string): Promise<void> {
    // The status tabs: All, To sign, Waiting, Sealed, Drafts, Stopped.
    const map: Record<string, RegExp> = {
      awaiting: /^waiting/i,
      'awaiting others': /^waiting/i,
      'awaiting you': /^to sign/i,
      completed: /^sealed/i,
      sealed: /^sealed/i,
      drafts: /^drafts/i,
      draft: /^drafts/i,
      declined: /^stopped/i,
      all: /^all/i,
    };
    await this.page.getByRole('tab', { name: map[status.toLowerCase()] ?? /^all/i }).click();
  }

  async openEnvelope(title: string): Promise<void> {
    await this.page
      .getByRole('button', { name: new RegExp(title, 'i') })
      .first()
      .click();
  }

  async startNewEnvelope(): Promise<void> {
    await this.page.getByRole('button', { name: /new document/i }).click();
  }
}
