import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

function makePdf(name = 'contract.pdf', sizeBytes = 1024): File {
  const file = new File(['%PDF-1.4'], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

describe('App', () => {
  it('starts on the UploadPage', () => {
    renderApp();
    expect(
      screen.getByRole('heading', { level: 1, name: /start a new document/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /upload a pdf/i })).toBeInTheDocument();
  });

  it('opens the Create signature request dialog immediately after a PDF is chosen', () => {
    renderApp();
    const input = screen.getByLabelText(/choose pdf file/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makePdf()] } });
    expect(
      screen.getByRole('dialog', { name: /create your signature request/i }),
    ).toBeInTheDocument();
    // Apply is disabled until at least one receiver is added.
    expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled();
    // The document canvas has not rendered yet.
    expect(screen.queryByRole('document', { name: /page 1 of 4/i })).not.toBeInTheDocument();
  });

  it('advances to the DocumentPage after adding a signer and applying', () => {
    renderApp();
    const input = screen.getByLabelText(/choose pdf file/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makePdf()] } });
    fireEvent.click(screen.getByRole('button', { name: /add receiver/i }));
    const contact = screen.getByRole('option', { name: /eliran azulay/i });
    fireEvent.click(contact);
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    expect(screen.getByRole('document', { name: /page 1 of 4/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send to sign/i })).toBeInTheDocument();
  });

  it('cancelling the dialog returns to the UploadPage and discards picked signers', () => {
    renderApp();
    const input = screen.getByLabelText(/choose pdf file/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makePdf()] } });
    fireEvent.click(screen.getByRole('button', { name: /add receiver/i }));
    fireEvent.click(screen.getByRole('option', { name: /eliran azulay/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.getByRole('region', { name: /upload a pdf/i })).toBeInTheDocument();
    // Choose a file again — the dialog should reopen with no receivers.
    fireEvent.change(input, { target: { files: [makePdf()] } });
    expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled();
    expect(screen.queryAllByRole('button', { name: /remove receiver/i })).toHaveLength(0);
  });

  it('returns to the UploadPage when Back is clicked on the DocumentPage', () => {
    renderApp();
    const input = screen.getByLabelText(/choose pdf file/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makePdf()] } });
    fireEvent.click(screen.getByRole('button', { name: /add receiver/i }));
    fireEvent.click(screen.getByRole('option', { name: /eliran azulay/i }));
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    fireEvent.click(screen.getByRole('button', { name: /^back$/i }));
    expect(screen.getByRole('region', { name: /upload a pdf/i })).toBeInTheDocument();
  });

  it('DocumentPage shows the signer the user added in the pre-document dialog', () => {
    renderApp();
    const input = screen.getByLabelText(/choose pdf file/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makePdf()] } });
    fireEvent.click(screen.getByRole('button', { name: /add receiver/i }));
    fireEvent.click(screen.getByRole('option', { name: /eliran azulay/i }));
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    // The signers panel now has exactly one entry (with a remove button).
    expect(screen.getAllByRole('button', { name: /^remove signer/i })).toHaveLength(1);
    const panel = screen.getByLabelText(/^signers$/i);
    expect(panel.textContent ?? '').toMatch(/1/);
  });
});
