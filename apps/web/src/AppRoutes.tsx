import { Suspense, lazy } from 'react';
import { Outlet, Route, Routes } from 'react-router-dom';
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
      <Route path="/debug/auth" element={<DebugAuthPage />} />

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
        </Route>
      </Route>

      <Route index element={<RootLanding />} />
      <Route path="*" element={<RootLanding />} />
    </Routes>
  );
}
