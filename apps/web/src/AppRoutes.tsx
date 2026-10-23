import { Suspense, lazy } from 'react';
import { Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { AuthLoadingScreen } from './layout/AuthLoadingScreen';
import { RequireAuth } from './layout/RequireAuth';
import { RequireAuthOrGuest } from './layout/RequireAuthOrGuest';
import { RedirectWhenAuthed } from './layout/RedirectWhenAuthed';
import { RootLanding } from './layout/RootLanding';
import { DashboardPage, SentRedirect } from './pages/DashboardPage';
import { ContactsPage } from './pages/ContactsPage';
import { TemplatesListPage } from './pages/TemplatesListPage';
import { NewTemplateRoute } from './routes/NewTemplateRoute';
import { BulkSendPage } from './pages/BulkSendPage';
import { DebugAuthPage } from './pages/DebugAuthPage';
import { AuthPage } from './pages/AuthPage';
import { WelcomePage } from './pages/WelcomePage';
import { CheckEmailPage } from './pages/CheckEmailPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { GDriveOAuthCallbackPage } from './pages/GDriveOAuthCallbackPage';
import { MobileGdriveReturnPage } from './pages/MobileGdriveReturnPage';
import {
  AutomationDetailSettingsPage,
  AutomationsSettingsPage,
  DevelopersSettingsPage,
  NewAutomationSettingsPage,
  SettingsIndexPage,
} from './pages/SettingsPage';
import { ApproveQueuePage } from './pages/ApproveQueuePage';
import { RequireOwnerSession } from './features/approvals/RequireOwnerSession';
import { RequireSignerSession } from './features/signing/RequireSignerSession';
import { SigningErrorBoundary } from './features/signing/SigningErrorBoundary';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NotFoundRoute } from './pages/NotFoundPage';

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
const SigningFillPage = lazy(() =>
  import('./pages/SigningFillPage').then((m) => ({ default: m.SigningFillPage })),
);
const SigningLinkPage = lazy(() =>
  import('./pages/SigningLinkPage').then((m) => ({ default: m.SigningLinkPage })),
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

// Public template direct link (WP-37). Lazy and unauthenticated, like verify.
const DirectLinkPage = lazy(() =>
  import('./pages/DirectLinkPage').then((m) => ({ default: m.DirectLinkPage })),
);

// Approvals (WP-22). The email-link page is public and tiny; the card and the
// guided review need a signed-in owner, and the review pulls in pdfjs.
const ApprovePage = lazy(() =>
  import('./pages/ApprovePage').then((m) => ({ default: m.ApprovePage })),
);
// WP-27: MCP OAuth consent, outside AppShell (same posture as /approve).
const OAuthConsentPage = lazy(() =>
  import('./pages/OAuthConsentPage').then((m) => ({ default: m.OAuthConsentPage })),
);
const ApproveDetailPage = lazy(() =>
  import('./pages/ApproveDetailPage').then((m) => ({ default: m.ApproveDetailPage })),
);
const ApproveReviewPage = lazy(() =>
  import('./pages/ApproveReviewPage').then((m) => ({ default: m.ApproveReviewPage })),
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
/** `/sign/:id/prep` and `/review` no longer exist: send the old links to `/fill`. */
function SigningStepRedirect() {
  const { envelopeId } = useParams<{ readonly envelopeId: string }>();
  return <Navigate to={`/sign/${envelopeId ?? ''}/fill`} replace />;
}

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
        <Route path="/signin" element={<AuthPage />} />
        <Route path="/signup" element={<AuthPage />} />
        <Route path="/check-email" element={<CheckEmailPage />} />
      </Route>
      {/* No passwords any more: old reset emails and bookmarks land on sign-in. */}
      <Route path="/forgot-password" element={<Navigate to="/signin" replace />} />
      {/* New-account step (name + terms). Needs a session, so it lives outside
          RedirectWhenAuthed; the page sends signed-out visitors to /signin. */}
      <Route path="/welcome" element={<WelcomePage />} />

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

      {/* MCP OAuth consent (WP-27). Outside <AppShell /> and outside RequireAuth:
          the page itself sends a signed-out owner to /signin?next=… and keeps
          the authorization request in sessionStorage meanwhile. Dark unless
          `mcpServer` and `mcpOauth` are both on. */}
      <Route
        path="/oauth/mcp/consent"
        element={
          <Suspense fallback={<AuthLoadingScreen />}>
            <OAuthConsentPage />
          </Suspense>
        }
      />

      {/* Public verify surface. Anyone with a 13-char short_code can pull
          the envelope's metadata + audit timeline. No auth gate. */}
      <Route
        path="/verify"
        element={
          <Suspense fallback={<AuthLoadingScreen />}>
            <VerifyPage />
          </Suspense>
        }
      />
      <Route
        path="/verify/:shortCode"
        element={
          <Suspense fallback={<AuthLoadingScreen />}>
            <VerifyPage />
          </Suspense>
        }
      />

      {/* Public template direct link (WP-37): a name + email form that emails the
          visitor a normal signing link. The token in the path is the credential. */}
      <Route
        path="/d/:token"
        element={
          <Suspense fallback={<AuthLoadingScreen />}>
            <DirectLinkPage />
          </Suspense>
        }
      />

      {/* Owner approvals (WP-22). `/approve` is the email-link page: the token
          is in the URL fragment, never the path. The card and the review need
          a signed-in owner and send everyone else to /signin?next=…. All three
          live outside <AppShell /> so the ≤640px redirect never fires. */}
      <Route
        path="/approve"
        element={
          <Suspense fallback={<AuthLoadingScreen />}>
            <ApprovePage />
          </Suspense>
        }
      />
      <Route element={<RequireOwnerSession />}>
        <Route
          path="/approve/:id"
          element={
            <Suspense fallback={<AuthLoadingScreen />}>
              <ApproveDetailPage />
            </Suspense>
          }
        />
        <Route
          path="/approve/:id/review"
          element={
            <ErrorBoundary>
              <Suspense fallback={<AuthLoadingScreen />}>
                <ApproveReviewPage />
              </Suspense>
            </ErrorBoundary>
          }
        />
      </Route>

      {/* Public recipient signing flow. Entry, link states, done, and declined
          are accessible without a live session; fill requires the `seald_sign`
          cookie set by /sign/start. The old prep and review steps are folded
          into fill (consent bar, Finish sheet), so they redirect there. */}
      <Route element={<SigningRouteRoot />}>
        <Route path="/sign/:envelopeId" element={<SigningEntryPage />} />
        <Route element={<RequireSignerSession />}>
          <Route path="/sign/:envelopeId/fill" element={<SigningFillPage />} />
        </Route>
        <Route path="/sign/:envelopeId/prep" element={<SigningStepRedirect />} />
        <Route path="/sign/:envelopeId/review" element={<SigningStepRedirect />} />
        <Route path="/sign/:envelopeId/link/:state" element={<SigningLinkPage />} />
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
          <Route path="/document/:id/sent" element={<SentRedirect />} />
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
          {/* One canonical URL for Contacts. */}
          <Route path="/contacts" element={<Navigate to="/signers" replace />} />
          <Route path="/templates" element={<TemplatesListPage />} />
          {/* The Use dialog is part of the list page; this path stays as a deep link. */}
          <Route path="/templates/:id/use" element={<TemplatesListPage />} />
          <Route path="/templates/new" element={<NewTemplateRoute />} />
          <Route path="/templates/new/use" element={<Navigate to="/templates/new" replace />} />
          {/* WP-36: bulk CSV send. The page itself shows "not available" with
              `bulkSend` off, so the route can stay mounted. */}
          <Route path="/templates/:id/bulk-send/:batchId?" element={<BulkSendPage />} />
          {/* The template editor runs INSIDE AppShell so the global NavBar stays
              visible; its own bar (name, Cancel, Save template) sits below it. */}
          <Route
            path="/templates/:id/edit"
            element={
              <Suspense fallback={<AuthLoadingScreen />}>
                <TemplateEditorRoute />
              </Suspense>
            }
          />
          {/* Settings index (desktop). Rows show only for features whose flag
              is on. The Integrations breadcrumb points back here. */}
          <Route path="/settings" element={<SettingsIndexPage variant="desktop" />} />
          <Route
            path="/settings/developers"
            element={<DevelopersSettingsPage variant="desktop" />}
          />
          <Route path="/settings/approvals" element={<ApproveQueuePage variant="desktop" />} />
          {/* WP-31: automations. The pages render "Not available" with
              `workflowAutomations` off, so the routes can stay mounted. */}
          <Route
            path="/settings/automations"
            element={<AutomationsSettingsPage variant="desktop" />}
          />
          <Route
            path="/settings/automations/new"
            element={<NewAutomationSettingsPage variant="desktop" />}
          />
          <Route
            path="/settings/automations/:id"
            element={<AutomationDetailSettingsPage variant="desktop" />}
          />
          <Route
            path="/settings/integrations"
            element={
              <Suspense fallback={<AuthLoadingScreen />}>
                <IntegrationsPage />
              </Suspense>
            }
          />
        </Route>
        {/* Mobile settings index + Developers. Outside <AppShell /> for the
            same reason as /m/send: the phone has its own chrome. Guests are
            sent away by RequireAuth (keys need an email on the account). */}
        <Route path="/m/settings" element={<SettingsIndexPage variant="mobile" />} />
        <Route path="/m/settings/approvals" element={<ApproveQueuePage variant="mobile" />} />
        <Route
          path="/m/settings/developers"
          element={<DevelopersSettingsPage variant="mobile" />}
        />
        <Route
          path="/m/settings/automations"
          element={<AutomationsSettingsPage variant="mobile" />}
        />
        <Route
          path="/m/settings/automations/new"
          element={<NewAutomationSettingsPage variant="mobile" />}
        />
        <Route
          path="/m/settings/automations/:id"
          element={<AutomationDetailSettingsPage variant="mobile" />}
        />
      </Route>

      <Route index element={<RootLanding />} />
      {/* Unknown URLs get a real 404 (inside the shell when signed in). */}
      <Route path="*" element={<NotFoundRoute />} />
    </Routes>
  );
}
