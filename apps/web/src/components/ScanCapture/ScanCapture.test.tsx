import { createRef } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { ScanCapture } from './ScanCapture';

const camera = vi.hoisted(() => ({
  status: 'live' as 'starting' | 'live' | 'blocked',
  retry: vi.fn(),
}));
const imaging = vi.hoisted(() => ({
  captureFrame: vi.fn(),
  normalizePhoto: vi.fn(),
  renderFiltered: vi.fn(),
}));
const build = vi.hoisted(() => ({ buildScanPdf: vi.fn() }));

vi.mock('@/features/scan/useScanCamera', () => ({
  useScanCamera: () => ({ videoRef: createRef<HTMLVideoElement>(), ...camera }),
}));
vi.mock('@/features/scan/scanImaging', () => imaging);
vi.mock('@/features/scan/buildScanPdf', () => build);

function jpeg(name = 'p'): Blob {
  return new Blob([name], { type: 'image/jpeg' });
}

beforeEach(() => {
  camera.status = 'live';
  camera.retry.mockReset();
  imaging.captureFrame.mockReset().mockImplementation(async () => jpeg());
  imaging.normalizePhoto.mockReset().mockImplementation(async () => jpeg('picked'));
  imaging.renderFiltered.mockReset().mockImplementation(async () => jpeg('filtered'));
  build.buildScanPdf
    .mockReset()
    .mockResolvedValue(new File(['%PDF'], 'Scan.pdf', { type: 'application/pdf' }));
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:thumb-${(n += 1)}`);
  URL.revokeObjectURL = vi.fn();
});

async function shoot(times: number): Promise<void> {
  for (let i = 0; i < times; i++) {
    await userEvent.click(screen.getByRole('button', { name: 'Capture' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: new RegExp(`review ${i + 1} page`, 'i') }),
      ).toBeInTheDocument(),
    );
  }
}

describe('ScanCapture', () => {
  it('captures pages and reviews them', async () => {
    renderWithTheme(<ScanCapture onComplete={vi.fn()} />);
    await shoot(2);
    expect(screen.getByRole('status')).toHaveTextContent('Page 2 captured');
    await userEvent.click(screen.getByRole('button', { name: 'Review 2 pages' }));
    expect(screen.getByRole('heading', { name: '2 pages' })).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'Page 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use 2 pages' })).toBeEnabled();
  });

  it('removes and reorders pages', async () => {
    renderWithTheme(<ScanCapture onComplete={vi.fn()} />);
    await shoot(3);
    await userEvent.click(screen.getByRole('button', { name: 'Review 3 pages' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove page 2' }));
    expect(screen.getByRole('heading', { name: '2 pages' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move page 1 earlier' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move page 2 later' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Move page 1 later' }));
    await waitFor(() => expect(imaging.renderFiltered).toHaveBeenCalled());
  });

  it('builds the PDF with the chosen filter and hands it to the host', async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined);
    renderWithTheme(<ScanCapture onComplete={onComplete} />);
    await shoot(1);
    await userEvent.click(screen.getByRole('button', { name: 'Review 1 page' }));
    await userEvent.click(screen.getByRole('radio', { name: 'B/W' }));
    await userEvent.click(screen.getByRole('button', { name: 'Use 1 page' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(imaging.renderFiltered).toHaveBeenCalledWith(expect.any(Blob), 'bw');
    expect(build.buildScanPdf).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0]?.[0]).toBeInstanceOf(File);
  });

  it('shows an error and keeps the pages when the build fails', async () => {
    build.buildScanPdf.mockRejectedValueOnce(new Error('nope'));
    renderWithTheme(<ScanCapture onComplete={vi.fn()} />);
    await shoot(1);
    await userEvent.click(screen.getByRole('button', { name: 'Review 1 page' }));
    await userEvent.click(screen.getByRole('button', { name: 'Use 1 page' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByRole('button', { name: 'Use 1 page' })).toBeEnabled();
  });

  it('Retake clears the pages and returns to the camera', async () => {
    renderWithTheme(<ScanCapture onComplete={vi.fn()} />);
    await shoot(1);
    await userEvent.click(screen.getByRole('button', { name: 'Review 1 page' }));
    await userEvent.click(screen.getByRole('button', { name: 'Retake' }));
    expect(screen.getByRole('button', { name: 'Capture' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /review/i })).not.toBeInTheDocument();
  });

  it('stops the shutter at the page cap', async () => {
    renderWithTheme(<ScanCapture onComplete={vi.fn()} />);
    const input = screen.getByTestId('scan-photo-input');
    const files = Array.from(
      { length: 25 },
      (_, i) => new File(['x'], `${i}.jpg`, { type: 'image/jpeg' }),
    );
    fireEvent.change(input, { target: { files } });
    expect(await screen.findByRole('heading', { name: '20 pages' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add page' })).toBeDisabled();
  });

  it('falls back to choosing photos when the camera is blocked', async () => {
    camera.status = 'blocked';
    renderWithTheme(<ScanCapture onComplete={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Camera is blocked' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose from photos' })).toBeInTheDocument();
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('scan-photo-input'), { target: { files: [file] } });
    expect(await screen.findByRole('heading', { name: '1 page' })).toBeInTheDocument();
    expect(imaging.normalizePhoto).toHaveBeenCalledWith(file);
    await userEvent.click(screen.getByRole('button', { name: 'Add page' }));
  });

  it('can retry the camera from the blocked state', async () => {
    camera.status = 'blocked';
    renderWithTheme(<ScanCapture onComplete={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Try the camera again' }));
    expect(camera.retry).toHaveBeenCalled();
  });

  it('closes from the camera', async () => {
    const onClose = vi.fn();
    renderWithTheme(<ScanCapture onComplete={vi.fn()} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has no axe violations on the review screen', async () => {
    const { container } = renderWithTheme(<ScanCapture onComplete={vi.fn()} />);
    await shoot(1);
    await userEvent.click(screen.getByRole('button', { name: 'Review 1 page' }));
    expect(await axe(container)).toHaveNoViolations();
  });
});
