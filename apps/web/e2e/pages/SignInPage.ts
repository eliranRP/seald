import { expect, type Page } from '@playwright/test';

export class SignInPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/signin');
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.page.getByLabel(/email/i).fill(email);
    await this.page.getByLabel(/password/i).fill(password);
    await this.page.getByRole('button', { name: /sign in/i }).click();
  }

  async expectFormVisible(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  }
}
