import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useScanCamera } from './useScanCamera';

function fakeStream() {
  const stop = vi.fn();
  return { stream: { getTracks: () => [{ stop }] } as unknown as MediaStream, stop };
}

function setMediaDevices(value: unknown): void {
  Object.defineProperty(navigator, 'mediaDevices', { value, configurable: true });
}

afterEach(() => setMediaDevices(undefined));

describe('useScanCamera', () => {
  it('asks for the rear camera and goes live', async () => {
    const { stream } = fakeStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    setMediaDevices({ getUserMedia });
    const { result } = renderHook(() => useScanCamera(true));
    expect(result.current.status).toBe('starting');
    await waitFor(() => expect(result.current.status).toBe('live'));
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: false,
        video: expect.objectContaining({ facingMode: { ideal: 'environment' } }),
      }),
    );
  });

  it('is blocked when permission is denied', async () => {
    setMediaDevices({ getUserMedia: vi.fn().mockRejectedValue(new Error('NotAllowedError')) });
    const { result } = renderHook(() => useScanCamera(true));
    await waitFor(() => expect(result.current.status).toBe('blocked'));
  });

  it('is blocked when the browser has no camera API', async () => {
    setMediaDevices(undefined);
    const { result } = renderHook(() => useScanCamera(true));
    await waitFor(() => expect(result.current.status).toBe('blocked'));
  });

  it('releases the camera when disabled and on unmount', async () => {
    const { stream, stop } = fakeStream();
    setMediaDevices({ getUserMedia: vi.fn().mockResolvedValue(stream) });
    const { result, rerender, unmount } = renderHook(({ on }) => useScanCamera(on), {
      initialProps: { on: true },
    });
    await waitFor(() => expect(result.current.status).toBe('live'));
    rerender({ on: false });
    expect(stop).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('can retry after a block', async () => {
    const { stream } = fakeStream();
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(new Error('denied'))
      .mockResolvedValueOnce(stream);
    setMediaDevices({ getUserMedia });
    const { result } = renderHook(() => useScanCamera(true));
    await waitFor(() => expect(result.current.status).toBe('blocked'));
    result.current.retry();
    await waitFor(() => expect(result.current.status).toBe('live'));
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });
});
