import type { ReactElement } from 'react';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { seald } from '../styles/theme';

export function renderWithTheme(ui: ReactElement, options?: RenderOptions): RenderResult {
  return render(ui, {
    wrapper: ({ children }) => <ThemeProvider theme={seald}>{children}</ThemeProvider>,
    ...options,
  });
}
