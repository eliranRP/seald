import { expect, type Page } from '@playwright/test';

export class SigningFillPage {
  constructor(private readonly page: Page) {}

  async expectVisible(): Promise<void> {
    // The document is open once the header's More menu is there.
    await expect(this.page.getByRole('button', { name: 'More', exact: true })).toBeVisible();
  }

  /** The one consent step: tick the box, press Start. */
  async agreeAndStart(): Promise<void> {
    await this.page.getByRole('checkbox', { name: /agree to sign electronically/i }).check();
    await this.page.getByRole('button', { name: /^start$/i }).click();
  }

  async expectConsentBar(): Promise<void> {
    await expect(this.page.getByRole('button', { name: /^start$/i })).toBeVisible();
  }

  async drawSignature(): Promise<void> {
    // The SignerField button's accessible label is "Sign here (required)"
    // or "Sign here (optional)". Opens the signature sheet on the typed
    // name; one tap on Sign adopts it.
    await this.page
      .getByRole('button', { name: /^sign here \(/i })
      .first()
      .click();
    await this.page
      .getByRole('dialog', { name: /your signature/i })
      .getByRole('button', { name: /^sign$/i })
      .click();
  }

  /** Finish in the bar, then Sign in the confirmation sheet. */
  async finish(): Promise<void> {
    await this.page.getByRole('button', { name: /^finish$/i }).click();
    await this.page
      .getByRole('dialog', { name: /finish signing/i })
      .getByRole('button', { name: /^sign$/i })
      .click();
  }

  async openMenu(): Promise<void> {
    await this.page.getByRole('button', { name: 'More', exact: true }).click();
  }

  async decline(): Promise<void> {
    await this.openMenu();
    await this.page.getByRole('menuitem', { name: /^decline$/i }).click();
    await this.page
      .getByRole('dialog', { name: /decline to sign/i })
      .getByRole('button', { name: /^decline to sign$/i })
      .click();
  }

  async openNotMe(): Promise<void> {
    await this.openMenu();
    await this.page.getByRole('menuitem', { name: /not me\?/i }).click();
  }
}
