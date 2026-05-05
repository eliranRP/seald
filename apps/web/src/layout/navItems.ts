/**
 * Central list mapping top-level NavBar tabs to their URL pathnames.
 *
 * Exported so every route wrapper (AppShell, UploadRoute, DocumentRoute) drives
 * navigation from the same source — selecting a nav id always lands on the
 * canonical path, and active-state matching stays consistent across pages.
 */
export interface NavItemEntry {
  readonly id: string;
  readonly label: string;
  readonly path: string;
}

export const NAV_ITEMS: ReadonlyArray<NavItemEntry> = [
  { id: 'documents', label: 'Documents', path: '/documents' },
  { id: 'sign', label: 'Sign', path: '/document/new' },
  { id: 'signers', label: 'Contacts', path: '/signers' },
  { id: 'templates', label: 'Templates', path: '/templates' },
];

/**
 * Derive the NavBar's active item id from the current pathname.
 *
 * IA contract:
 *  - `/document/new` is the "Sign" tab (new-envelope upload + editor).
 *    Once the user sends, the URL transitions to `/document/:id/sent`
 *    which is reached from the Documents tab — `Sign` no longer applies.
 *  - `/document/:id` (EnvelopeDetailPage) and `/document/:id/sent`
 *    (SentConfirmationPage) are surfaced from the Documents dashboard,
 *    so they keep "Documents" highlighted.
 *  - `/templates` and any nested wizard surface
 *    (`/templates/:id/use`, `/templates/:id/edit`) keep "Templates" lit.
 *  - Everything else falls through to the simple prefix match against
 *    NAV_ITEMS, defaulting to "documents".
 *
 * Audit gap (2026-05-02): previously the "Sign" tab was lit for ANY
 * `/document/...` path, so reading an existing envelope or watching the
 * sent-confirmation flash mis-highlighted "Sign" instead of "Documents".
 */
export function matchNavId(pathname: string): string {
  // The new-envelope flow only owns the literal `/document/new` URL —
  // checking equality (rather than a prefix) avoids stealing ownership
  // of `/document/:id` from the Documents tab.
  if (pathname === '/document/new') {
    return 'sign';
  }
  if (pathname === '/signers' || pathname.startsWith('/signers/')) {
    return 'signers';
  }
  if (pathname === '/templates' || pathname.startsWith('/templates/')) {
    return 'templates';
  }
  const match = NAV_ITEMS.find(
    (item) =>
      item.id !== 'sign' &&
      item.id !== 'templates' &&
      (pathname === item.path || pathname.startsWith(`${item.path}/`)),
  );
  if (match) {
    return match.id;
  }
  return 'documents';
}
