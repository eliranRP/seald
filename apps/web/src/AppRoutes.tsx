import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { ContactsPage } from './pages/ContactsPage';
import { EmailPreviewPage } from './pages/EmailPreviewPage';
import { SentConfirmationPage } from './pages/SentConfirmationPage';
import { UploadRoute } from './routes/UploadRoute';
import { DocumentRoute } from './routes/DocumentRoute';

/**
 * The routed tree without a `Router` wrapper — so tests can mount the app
 * with a `MemoryRouter` to drive navigation through `initialEntries`.
 */
export function AppRoutes() {
  return (
    <Routes>
      {/* Flows with their own full-page chrome. */}
      <Route path="/document/new" element={<UploadRoute />} />
      <Route path="/document/:id" element={<DocumentRoute />} />
      <Route path="/document/:id/sent" element={<SentConfirmationPage />} />

      {/* Everything else lives under the shared AppShell with a single NavBar. */}
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/documents" replace />} />
        <Route path="/documents" element={<DashboardPage />} />
        <Route path="/signers" element={<ContactsPage />} />
        <Route path="/email/request" element={<EmailPreviewPage variant="request" />} />
        <Route path="/email/completed" element={<EmailPreviewPage variant="completed" />} />
        <Route path="*" element={<Navigate to="/documents" replace />} />
      </Route>
    </Routes>
  );
}
