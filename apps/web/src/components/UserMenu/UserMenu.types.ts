import type { HTMLAttributes } from 'react';

export interface UserMenuUser {
  readonly name: string;
  readonly email: string;
  readonly avatarUrl?: string | undefined;
}

export interface UserMenuProps extends HTMLAttributes<HTMLDivElement> {
  readonly user: UserMenuUser;
  readonly onSignOut: () => void;
  /**
   * Optional — when provided, renders a "Download my data" item that
   * fires the GDPR/CCPA DSAR export. Hidden when omitted so Storybook
   * and unauthenticated mocks render the lean menu.
   */
  readonly onExportData?: (() => void) | undefined;
  /**
   * Optional — when provided, renders a danger-styled "Delete account"
   * item. The handler is responsible for confirming the destructive
   * intent (the wired implementation prompts for a confirm phrase).
   */
  readonly onDeleteAccount?: (() => void) | undefined;
  /** Disables the export item while a request is in flight. */
  readonly isExporting?: boolean | undefined;
  /** Disables the delete item while a request is in flight. */
  readonly isDeleting?: boolean | undefined;
}
