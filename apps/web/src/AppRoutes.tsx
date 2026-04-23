import { Route, Routes } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { RequireAuth } from './layout/RequireAuth';
import { RequireAuthOrGuest } from './layout/RequireAuthOrGuest';
import { RedirectWhenAuthed } from './layout/RedirectWhenAuthed';
import { RootLanding } from './layout/RootLanding';
import { DashboardPage } from './pages/DashboardPage';
import { ContactsPage } from './pages/ContactsPage';
import { DebugAuthPage } from './pages/DebugAuthPage';
import { EmailPreviewPage } from './pages/EmailPreviewPage';
import { SentConfirmationPage } from './pages/SentConfirmationPage';
import { SignInPage } from './pages/SignInPage';
import { SignUpPage } from './pages/SignUpPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { CheckEmailPage } from './pages/CheckEmailPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { UploadRoute } from './routes/UploadRoute';
import { DocumentRoute } from './routes/DocumentRoute';

/**
 * The routed tree without a `Router` wrapper — so tests can mount the app
 * with a `MemoryRouter` to drive navigation through `initialEntries`.
 *
 * Route groups:
 *  - `RedirectWhenAuthed` — auth surfaces (signin/signup/forgot/check-email).
 *    Signed-in users can't reach these; they bounce back to `/documents`.
 *  - `RequireAuthOrGuest` — the sign-a-PDF flow. Guests can use this without
 *    an account; anonymous visitors are routed to `/signin`.
 *  - `RequireAuth` — dashboard, signers, email previews. Guests are sent to
 *    `/document/new` (their allowed surface); anonymous to `/signin`.
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

      {/* OAuth landing — always renders and decides navigation itself. */}
      <Route path="/auth/callback" element={<AuthCallbackPage />} />

      {/* Developer-only auth debug surface — no guard. */}
      <Route path="/debug/auth" element={<DebugAuthPage />} />

      {/* Sign-a-PDF flow: signed-in or guest. */}
      <Route element={<RequireAuthOrGuest />}>
        <Route path="/document/new" element={<UploadRoute />} />
        <Route path="/document/:id" element={<DocumentRoute />} />
        <Route path="/document/:id/sent" element={<SentConfirmationPage />} />
      </Route>

      {/* Authed-only surfaces under the shared AppShell chrome. */}
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/documents" element={<DashboardPage />} />
          <Route path="/signers" element={<ContactsPage />} />
          <Route path="/email/request" element={<EmailPreviewPage variant="request" />} />
          <Route path="/email/completed" element={<EmailPreviewPage variant="completed" />} />
        </Route>
      </Route>

      {/* Landing + catch-all resolve based on current auth state. */}
      <Route index element={<RootLanding />} />
      <Route path="*" element={<RootLanding />} />
    </Routes>
  );
}
