import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { AppRoutes } from './AppRoutes';
import { AppStateProvider } from './providers/AppStateProvider';
import { seald } from './styles/theme';

function renderApp(initialEntries: ReadonlyArray<string> = ['/']) {
  return render(
    <ThemeProvider theme={seald}>
      <AppStateProvider>
        <MemoryRouter initialEntries={[...initialEntries]}>
          <AppRoutes />
        </MemoryRouter>
      </AppStateProvider>
    </ThemeProvider>,
  );
}

function makePdf(name = 'contract.pdf', sizeBytes = 1024): File {
  const file = new File(['%PDF-1.4'], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

describe('App routing', () => {
  it('redirects root to the Dashboard', () => {
    renderApp(['/']);
    expect(
      screen.getByRole('heading', { level: 1, name: /everything you've sent/i }),
    ).toBeInTheDocument();
  });

  it('clicking "New document" on the Dashboard navigates to the upload flow', () => {
    renderApp(['/documents']);
    fireEvent.click(screen.getByRole('button', { name: /new document/i }));
    expect(screen.getByRole('region', { name: /upload a pdf/i })).toBeInTheDocument();
  });

  it('clicking the Sign NavBar tab navigates to /document/new', () => {
    renderApp(['/documents']);
    // The NavBar's Sign tab is the single entry point into the upload flow.
    fireEvent.click(screen.getByRole('button', { name: /^sign$/i }));
    expect(screen.getByRole('region', { name: /upload a pdf/i })).toBeInTheDocument();
  });

  it('opens the Create signature request dialog immediately after a PDF is chosen', () => {
    renderApp(['/document/new']);
    const input = screen.getByLabelText(/choose pdf file/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makePdf()] } });
    expect(
      screen.getByRole('dialog', { name: /create your signature request/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled();
  });

  it('cancelling the dialog stays on the upload page and discards picked signers', async () => {
    renderApp(['/document/new']);
    const input = screen.getByLabelText(/choose pdf file/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makePdf()] } });
    fireEvent.click(screen.getByRole('button', { name: /add receiver/i }));
    // Seed contacts load from the mock API — wait before picking one.
    fireEvent.click(await screen.findByRole('option', { name: /eliran azulay/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.getByRole('region', { name: /upload a pdf/i })).toBeInTheDocument();
    fireEvent.change(input, { target: { files: [makePdf()] } });
    expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled();
    expect(screen.queryAllByRole('button', { name: /remove receiver/i })).toHaveLength(0);
  });

  it('Signers page lists seed contacts', async () => {
    renderApp(['/signers']);
    expect(
      screen.getByRole('heading', { level: 1, name: /people you send documents to/i }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/eliran@azulay.co/i)).toBeInTheDocument();
  });

  it('Signers page opens the add dialog', () => {
    renderApp(['/signers']);
    fireEvent.click(screen.getByRole('button', { name: /^add signer$/i }));
    expect(screen.getByRole('dialog', { name: /^add signer$/i })).toBeInTheDocument();
  });
});
