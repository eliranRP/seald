import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/renderWithProviders';
import { ScanPage } from './ScanPage';

const api = vi.hoisted(() => ({
  getPhoneScanSession: vi.fn(),
  postScanPdf: vi.fn(),
}));
const mobile = vi.hoisted(() => ({ value: false }));
const captured = vi.hoisted(() => ({
  complete: null as null | ((pdf: File) => Promise<void>),
}));

vi.mock('@/features/scan/scanApi', () => api);
vi.mock('@/hooks/useIsMobileViewport', () => ({
  useIsMobileViewport: () => mobile.value,
  readIsMobileViewport: () => mobile.value,
}));
vi.mock('@/components/ScanCapture', () => ({
  ScanCapture: (p: { onComplete: (pdf: File) => Promise<void>; onClose?: () => void }) => {
    captured.complete = p.onComplete;
    return (
      <div>
        <p>camera</p>
        {p.onClose ? <button onClick={p.onClose}>close camera</button> : null}
        <button
          onClick={() =>
            void p
              .onComplete(new File(['%PDF'], 'Scan.pdf', { type: 'application/pdf' }))
              .catch(() => undefined)
          }
        >
          finish
        </button>
      </div>
    );
  },
}));
vi.mock('@/components/ScanWithPhoneDialog', () => ({
  ScanWithPhoneDialog: (p: { onClose: () => void; onContinue: (pdf: File) => void }) => (
    <div>
      <p>qr dialog</p>
      <button onClick={p.onClose}>close dialog</button>
      <button onClick={() => p.onContinue(new File(['%PDF'], 'Scan.pdf'))}>continue</button>
    </div>
  ),
}));

function Where() {
  const loc = useLocation();
  const file = (loc.state as { pendingFile?: File } | null)?.pendingFile;
  return <div data-testid="where">{`${loc.pathname}|${file?.name ?? ''}`}</div>;
}

function renderAt(path: string) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/scan" element={<ScanPage />} />
        <Route path="/scan/:code" element={<ScanPage />} />
        <Route path="/document/new" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

const CODE = 'c'.repeat(32);

beforeEach(() => {
  mobile.value = false;
  api.getPhoneScanSession.mockReset().mockResolvedValue({ status: 'pending', expires_at: 'x' });
  api.postScanPdf.mockReset().mockResolvedValue({ page_count: 2 });
});

describe('ScanPage: owner at /scan', () => {
  it('shows the QR dialog on a computer and goes back to the upload screen on close', async () => {
    renderAt('/scan');
    expect(screen.getByText('qr dialog')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'close dialog' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/document/new|');
  });

  it('carries the scanned PDF into the upload flow', async () => {
    renderAt('/scan');
    await userEvent.click(screen.getByRole('button', { name: 'continue' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/document/new|Scan.pdf');
  });

  it('opens the camera straight away on a phone', async () => {
    mobile.value = true;
    renderAt('/scan');
    expect(screen.getByText('camera')).toBeInTheDocument();
    expect(screen.queryByText('qr dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'finish' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/document/new|Scan.pdf');
  });
});

describe('ScanPage: phone at /scan/:code', () => {
  it('checks the code, opens the camera and posts the PDF once', async () => {
    renderAt(`/scan/${CODE}`);
    expect(await screen.findByText('camera')).toBeInTheDocument();
    expect(api.getPhoneScanSession).toHaveBeenCalledWith(CODE, expect.anything());
    await userEvent.click(screen.getByRole('button', { name: 'finish' }));
    expect(
      await screen.findByRole('heading', { name: 'Sent to your computer' }),
    ).toBeInTheDocument();
    expect(api.postScanPdf).toHaveBeenCalledWith(CODE, expect.any(File));
  });

  it.each([
    ['expired', { status: 'expired' }, 'This link expired'],
    ['already sent', { status: 'received' }, 'Already sent'],
  ])('says so when the link is %s', async (_name, view, title) => {
    api.getPhoneScanSession.mockResolvedValue({ ...view, expires_at: 'x' });
    renderAt(`/scan/${CODE}`);
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
  });

  it('treats an unknown code as invalid', async () => {
    api.getPhoneScanSession.mockRejectedValue(Object.assign(new Error('nf'), { status: 404 }));
    renderAt(`/scan/${CODE}`);
    expect(
      await screen.findByRole('heading', { name: "This link isn't valid" }),
    ).toBeInTheDocument();
  });

  it('offers a retry when the server cannot be reached', async () => {
    api.getPhoneScanSession.mockRejectedValueOnce(new Error('Network Error'));
    renderAt(`/scan/${CODE}`);
    expect(await screen.findByRole('heading', { name: "Can't reach Seald" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('camera')).toBeInTheDocument();
  });

  it('flips to expired when the post is refused as gone', async () => {
    api.postScanPdf.mockRejectedValue(Object.assign(new Error('gone'), { status: 410 }));
    renderAt(`/scan/${CODE}`);
    await userEvent.click(await screen.findByRole('button', { name: 'finish' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'This link expired' })).toBeInTheDocument(),
    );
  });

  it('stays on the camera when the post fails for another reason', async () => {
    api.postScanPdf.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
    renderAt(`/scan/${CODE}`);
    await userEvent.click(await screen.findByRole('button', { name: 'finish' }));
    await waitFor(() => expect(api.postScanPdf).toHaveBeenCalled());
    expect(screen.getByText('camera')).toBeInTheDocument();
  });
});
