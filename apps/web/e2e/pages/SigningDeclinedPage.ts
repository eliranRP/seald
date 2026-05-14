import { expect, type Page } from '@playwright/test';

export class SigningDeclinedPage {
  constructor(private readonly page: Page) {}

  async expectVisible(): Promise<void> {
    // PR-4 (signer-flow audit, #260) branches the H1 on `decline_reason`:
    //   - default            → "You declined this request."
    //   - consent-withdrawn  → "You withdrew consent to sign electronically."
    //   - not-the-recipient  → "Thanks — we marked this link as the wrong recipient."
    // Match the URL (invariant for the page) and any of the three known
    // headings — the H1 in any variant must be visible.
    await expect(this.page).toHaveURL(/\/sign\/[^/]+\/declined/);
    await expect(
      this.page.getByRole('heading', {
        name: /declined this request|withdrew consent|wrong recipient/i,
      }),
    ).toBeVisible();
  }
}
