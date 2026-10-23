import type { JSX } from 'react';
import { Route, Routes } from 'react-router-dom';
import { OfflineBar } from '@/components/OfflineBar';
import { AppShell } from '@/layout/AppShell';
import { AuthLoadingScreen } from '@/layout/AuthLoadingScreen';
import { PublicHeader } from '@/layout/PublicHeader';
import { useAuth } from '@/providers/AuthProvider';
import { NotFoundPage } from './NotFoundPage';

/**
 * Element of the catch-all route. Signed-in users and guests get the 404
 * inside the app shell (nav stays usable); everyone else gets a public 404
 * with a logo header only. The index route `/` keeps RootLanding.
 */
export function NotFoundRoute(): JSX.Element {
  const { user, guest, loading } = useAuth();
  if (loading) return <AuthLoadingScreen />;
  if (user || guest) {
    return (
      <Routes>
        <Route element={<AppShell />}>
          <Route path="*" element={<NotFoundPage variant="app" />} />
        </Route>
      </Routes>
    );
  }
  return (
    <>
      <OfflineBar />
      <PublicHeader />
      <NotFoundPage variant="public" />
    </>
  );
}
