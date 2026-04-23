import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SealdThemeProvider } from './providers/SealdThemeProvider';
import { App } from './App';
import './styles/tokens.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');
createRoot(rootEl).render(
  <StrictMode>
    <SealdThemeProvider>
      <App />
    </SealdThemeProvider>
  </StrictMode>,
);
