import { expect, type Page } from '@playwright/test';

export class SignUpPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/signup');
  }

  async signUp(fullName: string, email: string, password: string): Promise<void> {
    // Use textbox role so the password show/hide button doesn't shadow the
    // input under getByLabel (rule 4.6).
    await this.page.getByRole('textbox', { name: /full name/i }).fill(fullName);
    await this.page.getByRole('textbox', { name: /email/i }).fill(email);
    await this.page.getByRole('textbox', { name: /password/i }).fill(password);
    // The signup form gates submission on a "agree to ToS" checkbox.
    await this.page.getByRole('checkbox', { name: /agree.*terms/i }).check();
    await this.page.getByRole('button', { name: /^create account$/i }).click();
  }

  async expectFormVisible(): Promise<void> {
    await expect(
      this.page.getByRole('heading', { name: /create your account|sign up/i }),
    ).toBeVisible();
  }
}
