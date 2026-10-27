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
    expect(screen.getByRole('heading', { level: 1, name: /new document/i })).toBeInTheDocument();
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

  it('hides the "Start from a template" CTA when onPickTemplate is not supplied', () => {
    renderPage();
    expect(
      screen.queryByRole('button', { name: /start from a template/i }),
    ).not.toBeInTheDocument();
  });

  it('renders the "Start from a template" CTA and fires onPickTemplate when supplied', () => {
    const onPickTemplate = vi.fn();
    renderPage({ onPickTemplate });
    const cta = screen.getByRole('button', { name: /start from a template/i });
    fireEvent.click(cta);
    expect(onPickTemplate).toHaveBeenCalledTimes(1);
  });

  // 2026-05-04 — Drive entry was previously a separate full-width
  // <DriveSourceCard> below the dropzone. Per design feedback we
  // collapse it into the dropzone footer next to "Start from a
  // template" so the Sign flow has a single secondary-actions row.
  // The contract: caller supplies EITHER onPickDrive (connected
  // account) OR onConnectDrive (no account yet, popup-OAuth flow);
  // when neither is supplied the link is hidden entirely (feature
  // flag off path).
  it('hides the Drive CTA when neither onPickDrive nor onConnectDrive is supplied', () => {
    renderPage();
    expect(
      screen.queryByRole('button', { name: /pick from google drive/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /connect google drive/i })).not.toBeInTheDocument();
  });

  it('renders "Pick from Google Drive" + fires onPickDrive when supplied', () => {
    const onPickDrive = vi.fn();
    renderPage({ onPickDrive });
    const cta = screen.getByRole('button', { name: /pick from google drive/i });
    fireEvent.click(cta);
    expect(onPickDrive).toHaveBeenCalledTimes(1);
  });

  it('renders "Connect Google Drive" + fires onConnectDrive when supplied', () => {
    const onConnectDrive = vi.fn();
    renderPage({ onConnectDrive });
    const cta = screen.getByRole('button', { name: /connect google drive/i });
    fireEvent.click(cta);
    expect(onConnectDrive).toHaveBeenCalledTimes(1);
  });

  it('renders the Drive link alongside the template link in the same prompt row', () => {
    // Both supplied — the prompt row hosts both options, separated
    // by a divider. Asserts they share the same parent so a future
    // refactor doesn't accidentally re-orphan the Drive link into a
    // separate card row.
    renderPage({ onPickTemplate: vi.fn(), onPickDrive: vi.fn() });
    const tpl = screen.getByRole('button', { name: /start from a template/i });
    const drv = screen.getByRole('button', { name: /pick from google drive/i });
    expect(tpl.parentElement).toBe(drv.parentElement);
  });

  it('has no axe violations', async () => {
    const { container } = renderPage();
    expect(await axe(container)).toHaveNoViolations();
  });

  describe('with source tiles and Word support', () => {
    it('lists the sources as a radiogroup with Upload selected', () => {
      renderPage({
        allowWord: true,
        showSources: true,
        onPickTemplate: vi.fn(),
        templateCount: 6,
        onPickDrive: vi.fn(),
        onScan: vi.fn(),
      });
      const group = screen.getByRole('radiogroup', { name: 'Source' });
      expect(group).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /upload file/i })).toHaveAttribute(
        'aria-checked',
        'true',
      );
      expect(screen.getByRole('radio', { name: /template/i })).toHaveAttribute(
        'aria-checked',
        'false',
      );
      expect(screen.getByRole('radio', { name: /google drive/i })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /scan with phone/i })).toBeInTheDocument();
    });

    it('fires each source handler', () => {
      const onPickTemplate = vi.fn();
      const onPickDrive = vi.fn();
      const onScan = vi.fn();
      renderPage({ showSources: true, onPickTemplate, onPickDrive, onScan });
      fireEvent.click(screen.getByRole('radio', { name: /template/i }));
      fireEvent.click(screen.getByRole('radio', { name: /google drive/i }));
      fireEvent.click(screen.getByRole('radio', { name: /scan with phone/i }));
      expect(onPickTemplate).toHaveBeenCalledTimes(1);
      expect(onPickDrive).toHaveBeenCalledTimes(1);
      expect(onScan).toHaveBeenCalledTimes(1);
    });

    it('accepts a Word file when allowWord is on', () => {
      const onFileSelected = vi.fn();
      renderPage({ allowWord: true, onFileSelected });
      const input = screen.getByLabelText('Choose file') as HTMLInputElement;
      const docx = makeFile(
        'contract.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        1024,
      );
      fireEvent.change(input, { target: { files: [docx] } });
      expect(onFileSelected).toHaveBeenCalledWith(docx);
    });

    it('rejects a PNG saying what is wrong and how to fix it, with the file name and Choose another file', () => {
      const onFileSelected = vi.fn();
      renderPage({ allowWord: true, showSources: true, onFileSelected });
      const input = screen.getByLabelText('Choose file') as HTMLInputElement;
      fireEvent.change(input, { target: { files: [makeFile('Invoice.png', 'image/png', 10)] } });
      expect(onFileSelected).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent(
        "This file type isn't supported. Upload a PDF or Word file.",
      );
      expect(screen.getByText('Invoice.png')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /choose another/i })).toBeInTheDocument();
    });

    it('rejects a big file naming the limit and the fix, and offers Drive', () => {
      const onPickDrive = vi.fn();
      renderPage({ allowWord: true, showSources: true, onPickDrive });
      const input = screen.getByLabelText('Choose file') as HTMLInputElement;
      fireEvent.change(input, {
        target: { files: [makeFile('Scanned contract.pdf', 'application/pdf', 41 * 1024 * 1024)] },
      });
      expect(screen.getByRole('alert')).toHaveTextContent(
        'This file is larger than 25 MB. Please choose a smaller file.',
      );
      fireEvent.click(screen.getByRole('button', { name: /try google drive/i }));
      expect(onPickDrive).toHaveBeenCalledTimes(1);
    });

    it('shows recent templates as chips and fires the pick', () => {
      const onPickRecentTemplate = vi.fn();
      renderPage({
        showSources: true,
        recentTemplates: [{ id: 't1', name: 'NDA — mutual', signers: 2 }],
        onPickRecentTemplate,
      });
      fireEvent.click(screen.getByRole('button', { name: /nda — mutual/i }));
      expect(onPickRecentTemplate).toHaveBeenCalledWith('t1');
    });
  });

  describe('loading states', () => {
    it('shows the analyzing checklist with live page count and cancels', () => {
      const onCancelAnalysis = vi.fn();
      renderPage({
        status: 'analyzing',
        analyzingFileName: 'Master services agreement.pdf',
        analyzedPages: 8,
        onCancelAnalysis,
      });
      expect(screen.getByRole('status')).toHaveTextContent('Master services agreement.pdf');
      expect(screen.getByText('Read file')).toBeInTheDocument();
      expect(screen.getByText('Pages')).toBeInTheDocument();
      expect(screen.getByText('8')).toBeInTheDocument();
      expect(screen.getByText(/opens the editor when ready/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      expect(onCancelAnalysis).toHaveBeenCalledTimes(1);
    });

    it('shows the Word conversion step', () => {
      renderPage({ status: 'converting', analyzingFileName: 'Q3 vendor agreement.docx' });
      expect(screen.getByText('Convert to PDF')).toBeInTheDocument();
    });

    it('shows a failure with Retry when conversion fails', () => {
      const onRetryConversion = vi.fn();
      renderPage({
        status: 'converting',
        analyzingFileName: 'a.docx',
        conversionFailed: true,
        onRetryConversion,
        onCancelAnalysis: vi.fn(),
      });
      expect(screen.getByRole('alert')).toHaveTextContent(/couldn.t convert this file to pdf/i);
      fireEvent.click(screen.getByRole('button', { name: /retry/i }));
      expect(onRetryConversion).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: /upload another/i })).toBeInTheDocument();
    });
  });
});
