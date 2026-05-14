import { Suspense, lazy } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { AuthLoadingScreen } from './layout/AuthLoadingScreen';
import { RequireAuth } from './layout/RequireAuth';
import { RequireAuthOrGuest } from './layout/RequireAuthOrGuest';
import { RedirectWhenAuthed } from './layout/RedirectWhenAuthed';
import { RootLanding } from './layout/RootLanding';
import { DashboardPage } from './pages/DashboardPage';
import { ContactsPage } from './pages/ContactsPage';
import { TemplatesListPage } from './pages/TemplatesListPage';
import { UseTemplatePage } from './pages/UseTemplatePage';
import { DebugAuthPage } from './pages/DebugAuthPage';
import { SentConfirmationPage } from './pages/SentConfirmationPage';
import { SignInPage } from './pages/SignInPage';
import { SignUpPage } from './pages/SignUpPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { CheckEmailPage } from './pages/CheckEmailPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { GDriveOAuthCallbackPage } from './pages/GDriveOAuthCallbackPage';
import { MobileGdriveReturnPage } from './pages/MobileGdriveReturnPage';
import { RequireSignerSession } from './features/signing/RequireSignerSession';
import { SigningErrorBoundary } from './features/signing/SigningErrorBoundary';
import { ErrorBoundary } from './components/ErrorBoundary';

// Code-split the authoring routes — they pull in pdfjs-dist via usePdfDocument
// + the editor canvas, which dwarfs every other chunk. Pushing them behind
// React.lazy keeps that weight off the dashboard / sign-in entry bundle.
const UploadRoute = lazy(() =>
  import('./routes/UploadRoute').then((m) => ({ default: m.UploadRoute })),
);
const DocumentRoute = lazy(() =>
  import('./routes/DocumentRoute').then((m) => ({ default: m.DocumentRoute })),
);
const TemplateEditorRoute = lazy(() =>
  import('./routes/TemplateEditorRoute').then((m) => ({ default: m.TemplateEditorRoute })),
);

// `/settings/integrations` — WT-B Drive integration page. Lazy because
// the gdrive feature is gated behind `feature.gdriveIntegration` and
// the typical first-time visitor won't reach this surface; keeping it
// out of the dashboard chunk avoids paying for the OAuth scaffolding
// up-front. Lives inside <AppShell /> so the existing mobile-redirect
// rule (640 px → /m/send) covers it without a new redirect (rule 4.4).
const IntegrationsPage = lazy(() =>
  import('./routes/settings/integrations/IntegrationsPage').then((m) => ({
    default: m.IntegrationsPage,
  })),
);

// Code-split every signing page so recipients don't pay for the sender
// bundle's Supabase / react-pdf weight on initial load.
const SigningEntryPage = lazy(() =>
  import('./pages/SigningEntryPage').then((m) => ({ default: m.SigningEntryPage })),
);
const SigningPrepPage = lazy(() =>
  import('./pages/SigningPrepPage').then((m) => ({ default: m.SigningPrepPage })),
);
const SigningFillPage = lazy(() =>
  import('./pages/SigningFillPage').then((m) => ({ default: m.SigningFillPage })),
);
const SigningReviewPage = lazy(() =>
  import('./pages/SigningReviewPage').then((m) => ({ default: m.SigningReviewPage })),
);
const SigningDonePage = lazy(() =>
  import('./pages/SigningDonePage').then((m) => ({ default: m.SigningDonePage })),
);
const SigningDeclinedPage = lazy(() =>
  import('./pages/SigningDeclinedPage').then((m) => ({ default: m.SigningDeclinedPage })),
);

// Public, unauthenticated verification surface. Lazy-loaded so the
// dashboard / sign-in entry bundle stays slim — verify.tsx pulls a chunk
// of styled-components + lucide icons that no other route uses (rule 2.5).
const VerifyPage = lazy(() =>
  import('./pages/VerifyPage').then((m) => ({ default: m.VerifyPage })),
);

// Mobile-web sender flow. Lazy-loaded so the desktop dashboard / sign-in
// bundle doesn't pay for the editor canvas + pdfjs weight (rule 2.5). Pulled
// in for any viewport ≤ 640px when the user lands on the app root.
const MobileSendPage = lazy(() =>
  import('./pages/MobileSendPage').then((m) => ({ default: m.MobileSendPage })),
);

// Mobile integrations settings screen — connect/disconnect Google Drive.
// Lazy-loaded alongside MobileSendPage (same audience, same reason).
const MobileIntegrationsPage = lazy(() =>
  import('./pages/MobileSendPage/screens/MWIntegrations').then((m) => ({
    default: m.MWIntegrations,
  })),
);

/**
 * Wraps the entire `/sign/*` subtree in a code-splitting boundary + a
 * signer-scoped error boundary. Recipients only download signing modules
 * on demand; render-time errors don't drag the sender app down with them.
 */
function SigningRouteRoot() {
  return (
    <SigningErrorBoundary>
      <Suspense fallback={<AuthLoadingScreen />}>
        <Outlet />
      </Suspense>
    </SigningErrorBoundary>
  );
}

/**
 * The routed tree without a `Router` wrapper — so tests can mount the app
 * with a `MemoryRouter` to drive navigation through `initialEntries`.
 *
 * IMPORTANT: every top-level path declared below must also be listed in
 * `apps/landing/_worker.js` (`SPA_EXACT` for exact matches, `SPA_PREFIXES`
 * for prefixes). The Cloudflare Pages deploy serves the landing site at
 * `/` and uses that worker to rewrite SPA routes to the SPA's HTML shell.
 * A path missing from the worker silently falls through to the landing
 * dist and serves the wrong HTML — production outage on 2026-05-02 was
 * exactly this (`/m/send` and `/templates` returned the landing page).
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<RedirectWhenAuthed />}>
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/check-email" element={<CheckEmailPage />} />
      </Route>

      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      {/* Audit C: DebugAuthPage #4 — the /debug/auth surface is gated to
          DEV-only builds. In production builds the route is unmounted so
          a direct URL navigation falls through to the catch-all landing.
          /me is auth-guarded so this isn't a credential leak, but a
          publicly mountable debug page is a SAST finding regardless. */}
      {import.meta.env.DEV ? <Route path="/debug/auth" element={<DebugAuthPage />} /> : null}

      {/* Drive OAuth popup-bridge — MUST live OUTSIDE <AppShell /> so the
          mobile-redirect rule (≤ 640 px → /m/send) does NOT fire on the
          480 × 720 popup before the postMessage + close effect can run.
          Bug G (Phase 6.A iter-2 PROD, 2026-05-04). Pinned by
          apps/web/src/pages/GDriveOAuthCallbackPage/AppRoutes.gdrive-oauth-callback.test.tsx. */}
      <Route path="/oauth/gdrive/callback" element={<GDriveOAuthCallbackPage />} />

      {/* Public verify surface. Anyone with a 13-char short_code can pull
          the envelope's metadata + audit timeline. No auth gate. */}
      <Route
        path="/verify/:shortCode"
        element={
          <Suspense fallback={<AuthLoadingScreen />}>
            <VerifyPage />
          </Suspense>
        }
      />

      {/* Public recipient signing flow. Entry, done, and declined are
          accessible without a live session; prep / fill / review require the
          `seald_sign` cookie set by /sign/start. */}
      <Route element={<SigningRouteRoot />}>
        <Route path="/sign/:envelopeId" element={<SigningEntryPage />} />
        <Route element={<RequireSignerSession />}>
          <Route path="/sign/:envelopeId/prep" element={<SigningPrepPage />} />
          <Route path="/sign/:envelopeId/fill" element={<SigningFillPage />} />
          <Route path="/sign/:envelopeId/review" element={<SigningReviewPage />} />
        </Route>
        <Route path="/sign/:envelopeId/done" element={<SigningDonePage />} />
        <Route path="/sign/:envelopeId/declined" element={<SigningDeclinedPage />} />
      </Route>

      <Route element={<RequireAuthOrGuest />}>
        <Route element={<AppShell />}>
          <Route
            path="/document/new"
            element={
              <Suspense fallback={<AuthLoadingScreen />}>
                <UploadRoute />
              </Suspense>
            }
          />
          <Route
            path="/document/:id"
            element={
              <Suspense fallback={<AuthLoadingScreen />}>
                <DocumentRoute />
              </Suspense>
            }
          />
          <Route path="/document/:id/sent" element={<SentConfirmationPage />} />
        </Route>
        {/* Mobile-web send flow. Sits outside <AppShell /> on purpose — the
            desktop NavBar would dominate a 375px viewport; the mobile flow
            ships its own stepper + sticky CTA chrome. */}
        <Route
          path="/m/send"
          element={
            <ErrorBoundary>
              <Suspense fallback={<AuthLoadingScreen />}>
                <MobileSendPage />
              </Suspense>
            </ErrorBoundary>
          }
        />
        {/* Bounce-back from Google's OAuth consent for the mobile flow.
            Forwards into /m/send?gdrive_connected=1 so the picker auto-
            opens once the new account row is in the React-Query cache.
            Lives outside <AppShell /> for the same reason as /m/send. */}
        <Route path="/m/send/drive" element={<MobileGdriveReturnPage />} />
        {/* Mobile integrations settings — connect/disconnect Google Drive.
            Lives outside <AppShell /> for the same reason as /m/send. */}
        <Route
          path="/m/send/settings"
          element={
            <Suspense fallback={<AuthLoadingScreen />}>
              <MobileIntegrationsPage />
            </Suspense>
          }
        />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/documents" element={<DashboardPage />} />
          <Route path="/signers" element={<ContactsPage />} />
          <Route path="/templates" element={<TemplatesListPage />} />
          <Route path="/templates/:id/use" element={<UseTemplatePage />} />
          {/* Step 3 of the templates wizard runs INSIDE AppShell so the
              global NavBar stays visible across the entire wizard.
              The TemplateFlowHeader (back / mode pill / step pills /
              cancel) sits BELOW the NavBar as a sub-chrome bar. */}
          <Route
            path="/templates/:id/edit"
            element={
              <Suspense fallback={<AuthLoadingScreen />}>
                <TemplateEditorRoute />
              </Suspense>
            }
          />
          {/* Stub Settings index — until a real Settings landing
              page lands, `/settings` redirects to the only settings
              surface that exists (Integrations). Audit slice C #4
              (MEDIUM): the Integrations breadcrumb now points back to
              `/settings`, so this route MUST exist for the link to
              navigate anywhere useful. */}
          <Route path="/settings" element={<Navigate to="/settings/integrations" replace />} />
          <Route
            path="/settings/integrations"
            element={
              <Suspense fallback={<AuthLoadingScreen />}>
                <IntegrationsPage />
              </Suspense>
            }
          />
        </Route>
      </Route>

      <Route index element={<RootLanding />} />
      <Route path="*" element={<RootLanding />} />
    </Routes>
  );
}
