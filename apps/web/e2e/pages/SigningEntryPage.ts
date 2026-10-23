import { expect, type Page } from '@playwright/test';

export class SigningEntryPage {
  constructor(private readonly page: Page) {}

  async goto(envelopeId: string, token = 'tok_test'): Promise<void> {
    // Entry POSTs /sign/start with `{ envelope_id, token }` and redirects
    // to /fill on success. The mock accepts any token; we just need a
    // non-empty `?t=` to avoid the "invalid" branch in the real component.
    await this.page.goto(`/sign/${envelopeId}?t=${token}`);
  }

  async expectVisible(): Promise<void> {
    await expect(this.page.getByText(/opening your document|link not valid/i)).toBeVisible();
  }

  async startSigning(): Promise<void> {
    // Entry auto-redirects to the document (fill) on success; the consent
    // bar waits there. No button to click.
    await this.page.waitForURL(/\/sign\/[^/]+\/fill/);
  }

  /** A refused link lands on `/sign/:id/link/:state` with its own heading. */
  async expectLinkState(heading: RegExp): Promise<void> {
    await expect(this.page).toHaveURL(/\/sign\/[^/]+\/link\//);
    await expect(this.page.getByRole('heading', { name: heading })).toBeVisible();
  }
}
