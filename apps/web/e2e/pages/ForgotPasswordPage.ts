import { expect, type Page } from '@playwright/test';

export class ForgotPasswordPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/forgot-password');
  }

  async requestReset(email: string): Promise<void> {
    await this.page.getByLabel(/email/i).fill(email);
    await this.page.getByRole('button', { name: /send|reset/i }).click();
  }

  async expectConfirmationVisible(): Promise<void> {
    await expect(this.page.getByText(/check your (email|inbox)/i)).toBeVisible();
  }
}
