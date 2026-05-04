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
  /**
   * Optional — when provided, renders an "Integrations" item that
   * navigates to /settings/integrations. Discoverability home for the
   * Google Drive feature; AppShell only passes a handler when
   * `feature.gdriveIntegration` is on AND the user is authed. The
   * `gdrive-feature-manager` skill forbids new top-level NAV_ITEMS, so
   * the avatar dropdown is the canonical entry point.
   */
  readonly onOpenIntegrations?: (() => void) | undefined;
  /** Disables the export item while a request is in flight. */
  readonly isExporting?: boolean | undefined;
  /** Disables the delete item while a request is in flight. */
  readonly isDeleting?: boolean | undefined;
}
