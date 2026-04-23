import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './AppRoutes';
import { AppStateProvider } from './providers/AppStateProvider';

/**
 * Top-level application component. Wraps the routed app tree in the shared
 * `AppStateProvider` so every page sees the same documents + contacts store,
 * and mounts the `BrowserRouter`. Tests use `AppRoutes` directly with a
 * `MemoryRouter` to control the starting URL.
 */
export function App() {
  return (
    <AppStateProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppStateProvider>
  );
}
