import type { ReactNode } from 'react';
import { ThemeProvider } from 'styled-components';
import { seald } from '../styles/theme';
import { GlobalStyles } from '../styles/globalStyles';

export interface SealdThemeProviderProps {
  readonly children: ReactNode;
}

/** Wraps descendants in the Seald theme and injects global styles. */
export function SealdThemeProvider(props: SealdThemeProviderProps) {
  const { children } = props;
  return (
    <ThemeProvider theme={seald}>
      <GlobalStyles />
      {children}
    </ThemeProvider>
  );
}
