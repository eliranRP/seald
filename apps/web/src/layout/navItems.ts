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
  { id: 'signers', label: 'Signers', path: '/signers' },
];

/**
 * Derive the NavBar's active item id from the current pathname. The "Sign" tab
 * stays active throughout the signature request flow (upload → editor → sent
 * confirmation); everything else maps via a simple prefix match.
 */
export function matchNavId(pathname: string): string {
  if (pathname === '/document/new' || pathname.startsWith('/document/')) {
    return 'sign';
  }
  const match = NAV_ITEMS.find(
    (item) =>
      item.id !== 'sign' && (pathname === item.path || pathname.startsWith(`${item.path}/`)),
  );
  if (match) {
    return match.id;
  }
  return 'documents';
}
