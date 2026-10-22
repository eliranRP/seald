import { describe, expect, it, vi } from 'vitest';
import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { UploadPage } from './UploadPage';
import type { UploadPageProps } from './UploadPage.types';
import { seald } from '../../styles/theme';

function renderPage(props: Partial<UploadPageProps> = {}) {
  const onFileSelected = props.onFileSelected ?? vi.fn();
  render(
    <ThemeProvider theme={seald}>
      <UploadPage {...props} onFileSelected={onFileSelected} />
    </ThemeProvider>,
  );
  return { onFileSelected };
}

function pdf(name: string, size = 1024): File {
  const file = new File(['x'], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('UploadPage with several files', () => {
  it('stays a single-file picker by default', () => {
    renderPage();
    const input = screen.getByLabelText('Choose PDF file');
    expect(input).not.toHaveAttribute('multiple');
    expect(screen.getByRole('button', { name: 'Choose file' })).toBeInTheDocument();
    expect(screen.getByText('Drop your PDF here')).toBeInTheDocument();
  });

  it('accepts several PDFs and hands them over in pick order', () => {
    const onFilesSelected = vi.fn();
    renderPage({ multiple: true, onFilesSelected });
    const input = screen.getByLabelText('Choose PDF files');
    expect(input).toHaveAttribute('multiple');
    expect(screen.getByRole('button', { name: 'Choose files' })).toBeInTheDocument();
    expect(screen.getByText('Drop your PDFs here')).toBeInTheDocument();

    const a = pdf('a.pdf');
    const b = pdf('b.pdf');
    fireEvent.change(input, { target: { files: [a, b] } });
    expect(onFilesSelected).toHaveBeenCalledWith([a, b]);
  });

  it('accepts several dropped PDFs', () => {
    const onFilesSelected = vi.fn();
    renderPage({ multiple: true, onFilesSelected });
    const zone = screen.getByRole('region', { name: 'Upload a PDF' });
    const a = pdf('a.pdf');
    const b = pdf('b.pdf');
    const drop = createEvent.drop(zone);
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [a, b] } });
    fireEvent(zone, drop);
    expect(onFilesSelected).toHaveBeenCalledWith([a, b]);
  });

  it('skips a file that is not a PDF or is too large, reports it, and keeps the rest', () => {
    const onFilesSelected = vi.fn();
    const onError = vi.fn();
    renderPage({ multiple: true, onFilesSelected, onError });
    const input = screen.getByLabelText('Choose PDF files');
    const good = pdf('good.pdf');
    fireEvent.change(input, {
      target: {
        files: [
          good,
          new File(['x'], 'notes.txt', { type: 'text/plain' }),
          pdf('huge.pdf', 26 * 1024 * 1024),
        ],
      },
    });
    expect(onFilesSelected).toHaveBeenCalledWith([good]);
    expect(onError).toHaveBeenCalledWith('type', expect.stringContaining('notes.txt'));
    expect(onError).toHaveBeenCalledWith('size', expect.stringContaining('huge.pdf'));
    expect(screen.getByText(/huge\.pdf is larger than 25 MB/i)).toBeInTheDocument();
  });

  it('does not call back when every file is rejected', () => {
    const onFilesSelected = vi.fn();
    renderPage({ multiple: true, onFilesSelected });
    fireEvent.change(screen.getByLabelText('Choose PDF files'), {
      target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] },
    });
    expect(onFilesSelected).not.toHaveBeenCalled();
  });

  it('falls back to onFileSelected with the first file when no list handler is given', () => {
    const onFileSelected = vi.fn();
    renderPage({ multiple: true, onFileSelected });
    const a = pdf('a.pdf');
    fireEvent.change(screen.getByLabelText('Choose PDF files'), {
      target: { files: [a, pdf('b.pdf')] },
    });
    expect(onFileSelected).toHaveBeenCalledWith(a);
  });
});
