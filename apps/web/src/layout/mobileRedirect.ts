/**
 * Paths that stay on the page the user asked for even on a ≤640px viewport.
 * The mobile-locks-to-`/m/send` rule in `AppShell` skips them. The guided
 * approval review (`/approve/:id/review`) is one of them: the owner has to
 * read the fields on the phone, and sending them to the sender would drop
 * the review. The standalone `/approve` page is exempt for the same reason.
 */
export function isMobileRedirectExempt(pathname: string): boolean {
  return pathname === '/approve' || pathname.startsWith('/approve/');
}
