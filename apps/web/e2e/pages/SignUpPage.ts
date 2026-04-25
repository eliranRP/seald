import { expect, type Page } from '@playwright/test';

export class SignUpPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/signup');
  }

  async signUp(fullName: string, email: string, password: string): Promise<void> {
    await this.page.getByLabel(/name/i).fill(fullName);
    await this.page.getByLabel(/email/i).fill(email);
    await this.page.getByLabel(/password/i).fill(password);
    await this.page.getByRole('button', { name: /sign up|create account/i }).click();
  }

  async expectFormVisible(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: /sign up|create/i })).toBeVisible();
  }
}
