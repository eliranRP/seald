import { expect, type Page } from '@playwright/test';

export class SignInPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/signin');
  }

  async signIn(email: string, password: string): Promise<void> {
    // Scope to textbox role so the "Show password" toggle button (also
    // labelled /password/i) doesn't match in strict mode (rule 4.6).
    await this.page.getByRole('textbox', { name: /email/i }).fill(email);
    await this.page.getByRole('textbox', { name: /password/i }).fill(password);
    await this.page.getByRole('button', { name: /^sign in$/i }).click();
  }

  async expectFormVisible(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: /welcome back|sign in/i })).toBeVisible();
  }
}
