/**
 * Paths that keep a ≤640px screen to themselves: the bottom MobileNav is
 * not rendered. The guided approval review (`/approve/:id/review`) and the
 * standalone `/approve` page are focused flows — the owner reads the fields
 * on the phone and acts, so tab-bar chrome would only compete with the
 * review's own sticky actions.
 *
 * (Before the v2 redesign this list exempted paths from the mobile lock to
 * `/m/send`; that lock is gone — every AppShell route now renders
 * responsively.)
 */
export function isMobileNavExempt(pathname: string): boolean {
  return pathname === '/approve' || pathname.startsWith('/approve/');
}
