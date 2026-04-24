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
import { DebugAuthPage } from './pages/DebugAuthPage';
import { SentConfirmationPage } from './pages/SentConfirmationPage';
import { SignInPage } from './pages/SignInPage';
import { SignUpPage } from './pages/SignUpPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { CheckEmailPage } from './pages/CheckEmailPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { UploadRoute } from './routes/UploadRoute';
import { DocumentRoute } from './routes/DocumentRoute';
import { RequireSignerSession } from './features/signing/RequireSignerSession';
import { SigningErrorBoundary } from './features/signing/SigningErrorBoundary';

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
        <Route path="/document/new" element={<UploadRoute />} />
        <Route path="/document/:id" element={<DocumentRoute />} />
        <Route path="/document/:id/sent" element={<SentConfirmationPage />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/documents" element={<DashboardPage />} />
          <Route path="/signers" element={<ContactsPage />} />
        </Route>
      </Route>

      <Route index element={<RootLanding />} />
      <Route path="*" element={<RootLanding />} />
    </Routes>
  );
}
