import { expect, type Page } from '@playwright/test';

/** The new-account step: name + terms (/welcome). */
export class WelcomePage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/welcome');
  }

  async expectVisible(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: 'Welcome to Seald' })).toBeVisible();
  }

  async complete(fullName: string): Promise<void> {
    await this.page.getByRole('textbox', { name: 'Full name' }).fill(fullName);
    await this.page
      .getByRole('checkbox', { name: /agree to the terms and privacy policy/i })
      .check();
    await this.page.getByRole('button', { name: 'Create account' }).click();
  }
}
