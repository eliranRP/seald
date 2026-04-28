import type { ReactElement, ReactNode } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { seald } from '../styles/theme';

export interface RenderSigningRouteOptions {
  /** e.g. `/sign/env-123/prep` — the `initialEntries` for MemoryRouter. */
  readonly initialEntry: string;
  /** The path pattern this page is mounted under, e.g. `/sign/:envelopeId/prep`. */
  readonly path: string;
}

/**
 * Renders the current pathname so tests can `getByTestId('__pathname__')`
 * to verify navigation after a redirect/replace without pulling in
 * `useLocation`-aware test doubles.
 *
 * Rule 4.6 exception — every other selector in the suite uses
 * role/name queries; this is the deliberate test-only sentinel. There
 * is no accessible role/name we could substitute (the probe renders an
 * inert `<div>` with the current pathname as text — no button, no
 * heading, no landmark would be semantically honest). Leave the testid
 * here, and DO NOT add new `data-testid` usage elsewhere without first
 * exhausting role/name alternatives.
 */
function LastPathnameProbe(): ReactElement {
  const loc = useLocation();
  return <div data-testid="__pathname__">{loc.pathname}</div>;
}

/**
 * Mounts one signing page under `MemoryRouter` + `QueryClientProvider` +
 * `ThemeProvider` with a fresh QueryClient. Every test file mocks
 * `lib/api/signApiClient` at the module boundary so the Nest API is never
 * contacted from jsdom.
 */
export function renderSigningRoute(
  element: ReactElement,
  options: RenderSigningRouteOptions,
): RenderResult {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <ThemeProvider theme={seald}>
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={[options.initialEntry]}>
            <Routes>
              <Route path={options.path} element={children as ReactElement} />
              <Route path="*" element={<LastPathnameProbe />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </ThemeProvider>
    );
  }
  return render(element, { wrapper: Wrapper });
}
