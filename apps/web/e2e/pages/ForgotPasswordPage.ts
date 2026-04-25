import { expect, type Page } from '@playwright/test';

export class ForgotPasswordPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/forgot-password');
  }

  async requestReset(email: string): Promise<void> {
    await this.page.getByRole('textbox', { name: /email/i }).fill(email);
    await this.page.getByRole('button', { name: /send reset link/i }).click();
  }

  async expectConfirmationVisible(): Promise<void> {
    // Confirmation lives at `/check-email?mode=reset` — the page redirects
    // there on submit success.
    await expect(this.page.getByRole('heading', { name: /check your email/i })).toBeVisible();
  }
}
