import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Page Object for `/signers` (the Contacts page). Thin wrapper over `page`
 * exposing semantic affordances (rule 4.6: query by accessible role/name).
 */
export class ContactsPage {
  constructor(readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/signers');
  }

  async expectVisible(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: 'Contacts', level: 1 })).toBeVisible();
  }

  /** The Add contacts dialog (a dialog on desktop). */
  get addDialog(): Locator {
    return this.page.getByRole('dialog', { name: 'Add contacts' });
  }

  get editDialog(): Locator {
    return this.page.getByRole('dialog', { name: 'Edit contact' });
  }

  /** Opens the Add contacts dialog from the header button or the empty state. */
  async openAddDialog(): Promise<void> {
    await this.page
      .getByRole('button', { name: /^add( contacts)?$/i })
      .first()
      .click();
    await expect(this.addDialog).toBeVisible();
  }

  async pasteEmails(text: string): Promise<void> {
    const field = this.addDialog.getByRole('textbox', { name: 'Emails' });
    await field.click();
    // Paste through the clipboard event path the page handles.
    await field.evaluate((el, value) => {
      const data = new DataTransfer();
      data.setData('text', value);
      el.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    }, text);
  }

  async openRowMenu(name: string): Promise<void> {
    await this.page.getByRole('button', { name: `More for ${name}` }).click();
  }

  async expectContactVisible(name: string): Promise<void> {
    await expect(this.page.getByText(name).first()).toBeVisible();
  }
}
