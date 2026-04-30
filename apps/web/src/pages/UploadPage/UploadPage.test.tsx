import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { ThemeProvider } from 'styled-components';
import { UploadPage } from './UploadPage';
import type { UploadPageErrorCode, UploadPageProps } from './UploadPage.types';
import { seald } from '../../styles/theme';

function renderPage(props: Partial<UploadPageProps> = {}) {
  const onFileSelected = props.onFileSelected ?? vi.fn();
  const utils = render(
    <ThemeProvider theme={seald}>
      <UploadPage {...props} onFileSelected={onFileSelected} />
    </ThemeProvider>,
  );
  return { ...utils, onFileSelected };
}

function makeFile(name: string, type: string, sizeBytes: number): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

describe('UploadPage', () => {
  it('renders the default heading and dropzone copy', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: /start a new document/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/drop your pdf here/i)).toBeInTheDocument();
    expect(screen.getByText(/up to 25 mb/i)).toBeInTheDocument();
  });

  it('opens the file picker when the primary button is clicked', () => {
    renderPage();
    const input = screen.getByLabelText(/choose pdf file/i) as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByRole('button', { name: /choose file/i }));
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('fires onFileSelected with an accepted file via the input', () => {
    const onFileSelected = vi.fn<(file: File) => void>();
    renderPage({ onFileSelected });
    const input = screen.getByLabelText(/choose pdf file/i) as HTMLInputElement;
    const file = makeFile('contract.pdf', 'application/pdf', 1024);
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFileSelected).toHaveBeenCalledTimes(1);
    const firstCall = onFileSelected.mock.calls[0];
    const selected = firstCall ? firstCall[0] : undefined;
    expect(selected?.name).toBe('contract.pdf');
  });

  it('rejects a non-PDF file and emits a type error', () => {
    const onFileSelected = vi.fn();
    const onError = vi.fn<(code: UploadPageErrorCode, message: string) => void>();
    renderPage({ onFileSelected, onError });
    const input = screen.getByLabelText(/choose pdf file/i) as HTMLInputElement;
    const file = makeFile('notes.txt', 'text/plain', 1024);
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFileSelected).not.toHaveBeenCalled();
    const firstCall = onError.mock.calls[0];
    expect(firstCall ? firstCall[0] : undefined).toBe('type');
    expect(screen.getByText(/isn't supported/i)).toBeInTheDocument();
  });

  it('rejects an oversized file and emits a size error', () => {
    const onFileSelected = vi.fn();
    const onError = vi.fn<(code: UploadPageErrorCode, message: string) => void>();
    renderPage({ onFileSelected, onError, maxSizeBytes: 10 });
    const input = screen.getByLabelText(/choose pdf file/i) as HTMLInputElement;
    const file = makeFile('huge.pdf', 'application/pdf', 1024 * 1024);
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFileSelected).not.toHaveBeenCalled();
    const firstCall = onError.mock.calls[0];
    expect(firstCall ? firstCall[0] : undefined).toBe('size');
    expect(screen.getByText(/larger than/i)).toBeInTheDocument();
  });

  it('accepts files dropped onto the dropzone', () => {
    const onFileSelected = vi.fn<(file: File) => void>();
    renderPage({ onFileSelected });
    const zone = screen.getByRole('region', { name: /upload a pdf/i });
    const file = makeFile('drop.pdf', 'application/pdf', 2048);
    fireEvent.dragEnter(zone, { dataTransfer: { files: [file] } });
    fireEvent.dragOver(zone, { dataTransfer: { files: [file] } });
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(onFileSelected).toHaveBeenCalledTimes(1);
    const firstCall = onFileSelected.mock.calls[0];
    expect(firstCall ? firstCall[0].name : undefined).toBe('drop.pdf');
  });

  it('accepts files matching a dotted-extension pattern', () => {
    const onFileSelected = vi.fn();
    renderPage({ onFileSelected, accept: '.pdf' });
    const input = screen.getByLabelText(/choose pdf file/i) as HTMLInputElement;
    // MIME type missing (some browsers pass empty) — extension should still match.
    const file = makeFile('signed.pdf', '', 1024);
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFileSelected).toHaveBeenCalledTimes(1);
  });

  it('has no axe violations', async () => {
    const { container } = renderPage();
    expect(await axe(container)).toHaveNoViolations();
  });
});
