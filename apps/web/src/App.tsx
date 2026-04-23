import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './AppRoutes';
import { AppStateProvider } from './providers/AppStateProvider';
import { AuthProvider } from './providers/AuthProvider';

/**
 * Top-level application component. Wraps the routed app tree in the shared
 * `AuthProvider` + `AppStateProvider` so every page sees the same session,
 * documents, and contacts store. Tests use `AppRoutes` directly with a
 * `MemoryRouter` and their own provider stand-ins.
 */
export function App() {
  return (
    <AuthProvider>
      <AppStateProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AppStateProvider>
    </AuthProvider>
  );
}
