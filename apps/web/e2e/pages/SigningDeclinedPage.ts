import { expect, type Page } from '@playwright/test';

export class SigningDeclinedPage {
  constructor(private readonly page: Page) {}

  async expectVisible(): Promise<void> {
    // The H1 branches on `decline_reason`:
    //   - default            → "Declined"
    //   - consent-withdrawn  → "You withdrew consent to sign electronically."
    //   - not-the-recipient  → "Wrong recipient"
    // Match the URL (invariant for the page) and any of the known headings.
    await expect(this.page).toHaveURL(/\/sign\/[^/]+\/declined/);
    await expect(
      this.page.getByRole('heading', {
        name: /^declined$|withdrew consent|wrong recipient/i,
      }),
    ).toBeVisible();
  }
}
