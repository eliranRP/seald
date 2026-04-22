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
    expect(screen.getByRole('group', { name: /Ada Lovelace/ })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Alan Turing/ })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Grace Hopper/ })).toBeInTheDocument();
  });

  it('renders a SignaturePad with a tablist', () => {
    renderApp();
    expect(screen.getByRole('tablist', { name: /signature mode/i })).toBeInTheDocument();
  });

  it('renders demo sections for new public components', () => {
    renderApp();
    expect(screen.getByRole('heading', { level: 2, name: 'Avatar' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Badge' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Card' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Icon' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'SignatureField' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'SignatureMark' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'StatusBadge' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'TextField' })).toBeInTheDocument();
  });
});
