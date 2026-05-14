import { expect, type Page } from '@playwright/test';

export class SigningPrepPage {
  constructor(private readonly page: Page) {}

  async expectVisible(): Promise<void> {
    await expect(this.page.getByRole('button', { name: /start signing/i })).toBeVisible();
  }

  async agreeAndContinue(): Promise<void> {
    // T-14: prep now has TWO checkboxes (Consumer Disclosure ack +
    // ESIGN §7001(c)(1)(C)(ii) "demonstrated ability" affirmation).
    // Both must be ticked before "Start signing" enables.
    await this.page.getByRole('checkbox', { name: /read the consumer disclosure/i }).check();
    await this.page
      .getByRole('checkbox', { name: /access electronic records on this device/i })
      .check();
    await this.page.getByRole('button', { name: /start signing/i }).click();
  }

  async decline(): Promise<void> {
    // PR-4 audit (item 5) moved the destructive opt-out actions into a
    // collapsed <details> "Need to opt out?" disclosure below the AES
    // disclosure. Open the disclosure first, then click the actual
    // decline link — which still triggers a native window.confirm()
    // (PR-4 only promoted withdraw-consent to a styled dialog).
    await this.page.getByRole('button', { name: /need to opt out/i }).click();
    this.page.once('dialog', (d) => {
      void d.accept();
    });
    await this.page.getByRole('button', { name: /decline this request/i }).click();
  }
}
