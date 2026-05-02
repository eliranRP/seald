import { expect, type Page } from '@playwright/test';

/**
 * Page object for the new mobile-web sender flow at `/m/send`.
 * Mirrors the production component tree under
 * `apps/web/src/pages/MobileSendPage/`. Queries are role/label-based
 * per CLAUDE.md rule 4.6 — no `data-testid`s.
 */
export class MobileSendPage {
  constructor(private readonly page: Page) {}

  async gotoRoot(): Promise<void> {
    await this.page.goto('/');
  }

  async goto(): Promise<void> {
    await this.page.goto('/m/send');
  }

  /** Tap the Upload PDF source tile and supply a PDF buffer. */
  async pickPdf(filename: string, contents: Buffer): Promise<void> {
    // The hidden <input type="file"> sits next to the tile and shares
    // the click handler. Setting its files directly bypasses the
    // file-picker chrome and triggers the React onChange.
    await this.page.getByLabel('PDF file').setInputFiles({
      name: filename,
      mimeType: 'application/pdf',
      buffer: contents,
    });
  }

  /** Sticky-bottom "Continue" CTA on the file-ready step. */
  async tapContinue(): Promise<void> {
    await this.page.getByRole('button', { name: /^Continue$/ }).click();
  }

  /** Toggle "Add me as signer" on the signers step. */
  async tapAddMeAsSigner(): Promise<void> {
    await this.page.getByLabel('Add me as signer').click();
  }

  /** Sticky-bottom "Next: place fields" CTA on the signers step. */
  async tapNextPlaceFields(): Promise<void> {
    await this.page.getByRole('button', { name: /Next: place fields/ }).click();
  }

  /** Arm the named field type from the bottom chip tray. */
  async armChip(name: 'Signature' | 'Initials' | 'Date' | 'Text' | 'Checkbox'): Promise<void> {
    // The chips live in the toolbar. Use exact match so "Signature" doesn't
    // collide with any selected-field aria-label like "Signature field for X".
    await this.page
      .getByRole('toolbar', { name: 'Field types' })
      .getByRole('button', { name: new RegExp(`^${name}`) })
      .click();
  }

  /** Tap the canvas at its centre to drop the armed field. */
  async tapCanvasCentre(): Promise<void> {
    // The canvas is a drawing surface — no fitting ARIA role. The kit
    // exposes it via `data-testid="mw-canvas"`; per rule 4.6 testid is
    // the documented last-resort when no semantic query works.
    const canvas = this.page.getByTestId('mw-canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('mobile canvas not measurable');
    await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }

  /** Apply the current selection in the open assigned-signers sheet. */
  async tapApplyOnSignersSheet(): Promise<void> {
    await this.page
      .getByRole('dialog')
      .getByRole('button', { name: /^Apply$/ })
      .click();
  }

  /** Sticky-bottom "Review" CTA on the place step. */
  async tapReview(): Promise<void> {
    await this.page.getByRole('button', { name: /^Review/ }).click();
  }

  /** Sticky-bottom "Send for signature" CTA on the review step. */
  async tapSendForSignature(): Promise<void> {
    await this.page.getByRole('button', { name: /Send for signature/ }).click();
  }

  /** Assert the place-step toolbar of field-type chips is visible. */
  async expectChipToolbarVisible(): Promise<void> {
    await expect(this.page.getByRole('toolbar', { name: 'Field types' })).toBeVisible();
  }

  /** Assert the place step's stepper label is visible. */
  async expectPlaceStepVisible(): Promise<void> {
    await expect(this.page.getByText(/Place the fields/i)).toBeVisible();
  }

  /** Assert the assigned-signers bottom sheet is open. */
  async expectAssignSignersSheetOpen(): Promise<void> {
    await expect(this.page.getByRole('dialog')).toBeVisible();
    // Heuristic: at least one signer chip is visible inside the dialog.
    await expect(this.page.getByRole('dialog').getByRole('button').first()).toBeVisible();
  }

  /** Assert N placed Signature fields appear on the canvas (each single-signer). */
  async expectSignatureFieldCount(n: number): Promise<void> {
    // Each placed field exposes an aria-label like "Signature field for <name>".
    await expect(this.page.getByLabel(/Signature field for /)).toHaveCount(n);
  }

  /** Assert the Sent ("Sent for signature") screen is reached. */
  async expectSentScreen(): Promise<void> {
    // The decorative "Sealed." script header is aria-hidden; the
    // accessible headline that confirms success is "Sent for signature".
    await expect(this.page.getByText(/Sent for signature/i)).toBeVisible();
  }
}
