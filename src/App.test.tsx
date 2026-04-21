import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { App } from './App';
import { seald } from './styles/theme';

function renderApp() {
  return render(
    <ThemeProvider theme={seald}>
      <App />
    </ThemeProvider>,
  );
}

describe('App dev harness', () => {
  it('renders the main heading', () => {
    renderApp();
    expect(
      screen.getByRole('heading', { level: 1, name: /seald — phase 1 demo/i }),
    ).toBeInTheDocument();
  });

  it('renders three SignerRow entries', () => {
    renderApp();
    const rows = screen.getAllByRole('group');
    expect(rows).toHaveLength(3);
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Alan Turing')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
  });

  it('renders a SignaturePad with a tablist', () => {
    renderApp();
    expect(screen.getByRole('tablist', { name: /signature mode/i })).toBeInTheDocument();
  });
});
