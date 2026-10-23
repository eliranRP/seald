import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithTheme } from '../../test/renderWithTheme';
import { ScanWithPhoneDialog } from './ScanWithPhoneDialog';

const api = vi.hoisted(() => ({
  createScanSession: vi.fn(),
  getScanSession: vi.fn(),
  takeScanPdf: vi.fn(),
  scanPhoneUrl: (code: string) => `https://app.test/scan/${code}`,
}));
vi.mock('@/features/scan/scanApi', () => api);
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(async () => 'data:image/png;base64,AAAA') },
}));

const CODE = 'c'.repeat(32);

function session(ms = 10 * 60_000) {
  return { code: CODE, expires_at: new Date(Date.now() + ms).toISOString() };
}

async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  api.createScanSession.mockReset().mockImplementation(async () => session());
  api.getScanSession.mockReset().mockResolvedValue({
    status: 'pending',
    expires_at: session().expires_at,
    page_count: null,
  });
  api.takeScanPdf.mockReset().mockResolvedValue(new File(['%PDF'], 'Scan.pdf'));
});
afterEach(() => vi.useRealTimers());

describe('ScanWithPhoneDialog', () => {
  it('renders nothing while closed and makes no session', () => {
    renderWithTheme(<ScanWithPhoneDialog open={false} onClose={vi.fn()} onContinue={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.createScanSession).not.toHaveBeenCalled();
  });

  it('shows the QR, the wait state and the 10 minute note', async () => {
    renderWithTheme(<ScanWithPhoneDialog open onClose={vi.fn()} onContinue={vi.fn()} />);
    await flush();
    expect(screen.getByRole('dialog', { name: 'Scan with your phone' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /qr code/i })).toHaveAttribute(
      'src',
      'data:image/png;base64,AAAA',
    );
    expect(screen.getByText('Open your camera and point it here')).toBeInTheDocument();
    expect(screen.getByText('Waiting for your phone…')).toBeInTheDocument();
    expect(screen.getByText('Link works for 10 min')).toBeInTheDocument();
  });

  it('shows pages received and continues with the scanned PDF', async () => {
    api.getScanSession.mockResolvedValue({
      status: 'received',
      expires_at: session().expires_at,
      page_count: 3,
    });
    // The request must survive the dialog leaving its polling state.
    api.takeScanPdf.mockImplementation(async (_code: string, signal: AbortSignal) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (signal.aborted) throw new Error('aborted');
      return new File(['%PDF'], 'Scan.pdf');
    });
    const onContinue = vi.fn();
    renderWithTheme(<ScanWithPhoneDialog open onClose={vi.fn()} onContinue={onContinue} />);
    await flush();
    await flush(2100);
    await flush(100);
    expect(screen.getByText('3 pages received')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onContinue.mock.calls[0]?.[0]).toBeInstanceOf(File);
    expect(api.takeScanPdf).toHaveBeenCalledWith(CODE, expect.anything());
  });

  it('offers a new code when the session expires', async () => {
    api.getScanSession.mockResolvedValue({
      status: 'expired',
      expires_at: session().expires_at,
      page_count: null,
    });
    renderWithTheme(<ScanWithPhoneDialog open onClose={vi.fn()} onContinue={vi.fn()} />);
    await flush();
    await flush(2100);
    expect(screen.getByText('This code expired.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'New code' }));
    await flush();
    expect(api.createScanSession).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Waiting for your phone…')).toBeInTheDocument();
  });

  it('expires on its own at the deadline', async () => {
    api.createScanSession.mockImplementation(async () => session(1500));
    renderWithTheme(<ScanWithPhoneDialog open onClose={vi.fn()} onContinue={vi.fn()} />);
    await flush();
    await flush(2100);
    expect(screen.getByText('This code expired.')).toBeInTheDocument();
    expect(api.getScanSession).not.toHaveBeenCalled();
  });

  it('reports a failure to start and can retry', async () => {
    api.createScanSession.mockRejectedValueOnce(new Error('down'));
    renderWithTheme(<ScanWithPhoneDialog open onClose={vi.fn()} onContinue={vi.fn()} />);
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't set up the scan");
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await flush();
    expect(screen.getByText('Waiting for your phone…')).toBeInTheDocument();
  });

  it('closes', async () => {
    const onClose = vi.fn();
    renderWithTheme(<ScanWithPhoneDialog open onClose={onClose} onContinue={vi.fn()} />);
    await flush();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
