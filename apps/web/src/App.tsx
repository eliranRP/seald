import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './AppRoutes';
import { AppStateProvider } from './providers/AppStateProvider';
import { AuthProvider } from './providers/AuthProvider';
import { queryClient } from './lib/api/queryClient';

/**
 * Top-level application component. Wraps the routed app tree in
 * `QueryClientProvider` (react-query cache for all API calls),
 * `AuthProvider` (Supabase session), and `AppStateProvider` (document /
 * contact state shared across pages). Tests use `AppRoutes` directly with a
 * `MemoryRouter` and their own provider stand-ins.
 */
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppStateProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AppStateProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
