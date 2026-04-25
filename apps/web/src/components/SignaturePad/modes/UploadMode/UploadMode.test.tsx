import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithTheme } from '@/test/renderWithTheme';
import { UploadMode } from './UploadMode';

type FileReaderLike = {
  result: string | ArrayBuffer | null;
  onload: ((this: FileReaderLike, ev: ProgressEvent<FileReader>) => unknown) | null;
  onerror: ((this: FileReaderLike, ev: ProgressEvent<FileReader>) => unknown) | null;
  readAsDataURL: (file: Blob) => void;
};

const STUB_DATA_URL = 'data:image/png;base64,AAA';

class StubFileReader implements FileReaderLike {
  result: string | ArrayBuffer | null = null;

  onload: ((this: FileReaderLike, ev: ProgressEvent<FileReader>) => unknown) | null = null;

  onerror: ((this: FileReaderLike, ev: ProgressEvent<FileReader>) => unknown) | null = null;

  readAsDataURL(_file: Blob): void {
    this.result = STUB_DATA_URL;
    if (this.onload) {
      this.onload.call(this, {} as ProgressEvent<FileReader>);
    }
  }
}

const originalFileReader = window.FileReader;

beforeEach(() => {
  Object.defineProperty(window, 'FileReader', {
    value: StubFileReader,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  Object.defineProperty(window, 'FileReader', {
    value: originalFileReader,
    configurable: true,
    writable: true,
  });
});

describe('UploadMode', () => {
  it('renders a drop zone with an accessible name', () => {
    renderWithTheme(<UploadMode onCommit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: /upload a signature image/i })).toBeInTheDocument();
  });

  it('rejects files over maxBytes and does not commit', () => {
    const onCommit = vi.fn();
    renderWithTheme(<UploadMode onCommit={onCommit} onCancel={vi.fn()} maxBytes={10} />);
    // no semantic role: hidden file input has no accessible role (rule 4.6 escape hatch)
    const input = screen.getByTestId('upload-mode-input') as HTMLInputElement;
    const bigFile = new File(['x'.repeat(20)], 'big.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [bigFile] } });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('rejects unsupported MIME types and does not commit', () => {
    const onCommit = vi.fn();
    renderWithTheme(<UploadMode onCommit={onCommit} onCancel={vi.fn()} />);
    // no semantic role: hidden file input has no accessible role (rule 4.6 escape hatch)
    const input = screen.getByTestId('upload-mode-input') as HTMLInputElement;
    const pdf = new File(['%PDF-1.4'], 'sig.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [pdf] } });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('commits a valid PNG via the hidden input change event', () => {
    const onCommit = vi.fn();
    renderWithTheme(<UploadMode onCommit={onCommit} onCancel={vi.fn()} />);
    // no semantic role: hidden file input has no accessible role (rule 4.6 escape hatch)
    const input = screen.getByTestId('upload-mode-input') as HTMLInputElement;
    const png = new File(['abc'], 'sig.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [png] } });
    expect(onCommit).toHaveBeenCalledTimes(1);
    const firstCall = onCommit.mock.calls[0];
    const arg = firstCall ? firstCall[0] : undefined;
    expect(arg).toEqual({
      kind: 'upload',
      pngDataUrl: expect.any(String),
      fileName: 'sig.png',
    });
  });

  it('commits a valid PNG dropped on the drop zone', () => {
    const onCommit = vi.fn();
    renderWithTheme(<UploadMode onCommit={onCommit} onCancel={vi.fn()} />);
    const zone = screen.getByRole('button', { name: /upload a signature image/i });
    const png = new File(['abc'], 'sig.png', { type: 'image/png' });
    fireEvent.drop(zone, { dataTransfer: { files: [png] } });
    expect(onCommit).toHaveBeenCalledTimes(1);
    const firstCall = onCommit.mock.calls[0];
    const arg = firstCall ? firstCall[0] : undefined;
    expect(arg).toEqual({
      kind: 'upload',
      pngDataUrl: expect.any(String),
      fileName: 'sig.png',
    });
  });

  it('surfaces an error when FileReader.onerror fires', () => {
    function makeFailingReader(): FileReaderLike {
      const reader: FileReaderLike = {
        result: null,
        onload: null,
        onerror: null,
        readAsDataURL(_file: Blob): void {
          if (reader.onerror) {
            reader.onerror.call(reader, {} as ProgressEvent<FileReader>);
          }
        },
      };
      return reader;
    }
    Object.defineProperty(window, 'FileReader', {
      value: function FailingFileReader() {
        return makeFailingReader();
      },
      configurable: true,
      writable: true,
    });

    const onCommit = vi.fn();
    renderWithTheme(<UploadMode onCommit={onCommit} onCancel={vi.fn()} />);
    // no semantic role: hidden file input has no accessible role (rule 4.6 escape hatch)
    const input = screen.getByTestId('upload-mode-input') as HTMLInputElement;
    const png = new File(['abc'], 'sig.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [png] } });
    expect(screen.getByRole('alert')).toHaveTextContent(/could not read file/i);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('Cancel button calls onCancel', async () => {
    const onCancel = vi.fn();
    renderWithTheme(<UploadMode onCommit={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
