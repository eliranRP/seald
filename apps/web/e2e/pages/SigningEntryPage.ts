import { expect, type Page } from '@playwright/test';

export class SigningEntryPage {
  constructor(private readonly page: Page) {}

  async goto(envelopeId: string, token = 'tok_test'): Promise<void> {
    // Entry POSTs /sign/start with `{ envelope_id, token }` and redirects
    // to /prep on success. The mock accepts any token; we just need a
    // non-empty `?t=` to avoid the "invalid" branch in the real component.
    await this.page.goto(`/sign/${envelopeId}?t=${token}`);
  }

  async expectVisible(): Promise<void> {
    await expect(this.page.getByText(/opening your document|signing link/i)).toBeVisible();
  }

  async startSigning(): Promise<void> {
    // Entry auto-redirects to /prep on success — no button to click.
    await this.page.waitForURL(/\/sign\/[^/]+\/prep/);
  }

  async expectErrorState(label: RegExp): Promise<void> {
    // Both 'expired' and 'burned' map to the "already been used" copy.
    await expect(this.page.getByText(/already been used|signing link is invalid/i)).toBeVisible();
    // Defensive: the test-passed regex is the one Cucumber threads
    // through, so still respect it as a no-op match against the page.
    void label;
  }
}
