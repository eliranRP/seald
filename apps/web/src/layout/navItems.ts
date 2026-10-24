import { FileText, LayoutTemplate, User, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Central list mapping top-level nav destinations to their URL pathnames.
 *
 * Exported so every shell surface (desktop NavBar, mobile bottom nav)
 * drives navigation from the same source — selecting a nav id always lands
 * on the canonical path, and active-state matching stays consistent.
 *
 * Redesign v2: Documents · Templates · Contacts. The old "Sign" tab is
 * gone — "New document" is the Documents page's primary action (and the
 * raised centre button of the mobile bottom nav).
 */
export interface NavItemEntry {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly icon: LucideIcon;
}

export const NAV_ITEMS: ReadonlyArray<NavItemEntry> = [
  { id: 'documents', label: 'Documents', path: '/documents', icon: FileText },
  { id: 'templates', label: 'Templates', path: '/templates', icon: LayoutTemplate },
  { id: 'signers', label: 'Contacts', path: '/signers', icon: Users },
];

/** Bottom nav on ≤640px: the desktop destinations plus "Me" (settings). */
export const MOBILE_NAV_ITEMS: ReadonlyArray<NavItemEntry> = [
  ...NAV_ITEMS,
  { id: 'settings', label: 'Me', path: '/settings', icon: User },
];

/** Where "New document" (top-bar primary / mobile centre button) goes. */
export const NEW_DOCUMENT_PATH = '/document/new';

function under(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * Derive the active nav id from the current pathname.
 *
 * IA contract:
 *  - `/document/new`, `/document/:id` and `/document/:id/sent` are all
 *    reached from Documents, so they keep "Documents" lit.
 *  - `/templates` and any nested wizard (`/templates/:id/use`, `/edit`)
 *    keep "Templates" lit.
 *  - `/signers` (Contacts) and nested paths keep "Contacts" lit.
 *  - `/settings/*` maps to "settings" — the mobile "Me" tab. The desktop
 *    bar has no settings item, so nothing is lit there.
 *  - Everything else falls back to "documents".
 */
export function matchNavId(pathname: string): string {
  if (under(pathname, '/signers')) return 'signers';
  if (under(pathname, '/templates')) return 'templates';
  if (under(pathname, '/settings')) return 'settings';
  return 'documents';
}
