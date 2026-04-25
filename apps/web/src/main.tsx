import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SealdThemeProvider } from './providers/SealdThemeProvider';
import { App } from './App';
import { initSentry } from './lib/observability';
import './styles/tokens.css';

// Initialise observability *before* React mounts so any render-time error
// bubbles up to Sentry rather than the void.
initSentry();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');
createRoot(rootEl).render(
  <StrictMode>
    <SealdThemeProvider>
      <App />
    </SealdThemeProvider>
  </StrictMode>,
);
