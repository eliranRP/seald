import { expect, type Page } from '@playwright/test';

/** The combined "Sign in or create account" screen (/signin and /signup). */
export class SignInPage {
  constructor(private readonly page: Page) {}

  async goto(path = '/signin'): Promise<void> {
    await this.page.goto(path);
  }

  async requestLink(email: string): Promise<void> {
    await this.page.getByRole('textbox', { name: 'Email' }).fill(email);
    await this.page.getByRole('button', { name: /^email me a (sign-in|new) link$/i }).click();
  }

  async expectFormVisible(): Promise<void> {
    await expect(
      this.page.getByRole('heading', { name: 'Sign in or create account' }),
    ).toBeVisible();
  }

  async expectCheckEmailFor(email: string): Promise<void> {
    await expect(this.page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await expect(this.page.getByRole('status', { name: /sign-in link sent/i })).toContainText(
      email,
    );
  }

  async expectAlert(text: string): Promise<void> {
    await expect(this.page.getByRole('alert')).toContainText(text);
  }

  async expectEmailValue(email: string): Promise<void> {
    await expect(this.page.getByRole('textbox', { name: 'Email' })).toHaveValue(email);
  }

  async expectStatus(text: string): Promise<void> {
    await expect(this.page.getByRole('status').filter({ hasText: text })).toBeVisible();
  }
}
