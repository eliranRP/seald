import { renderHook } from '@testing-library/react';
import { useEscapeKey } from './useEscapeKey';

describe('useEscapeKey', () => {
  it('calls handler on Escape when enabled', () => {
    const handler = vi.fn();
    renderHook(() => useEscapeKey(handler, true));

    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    window.dispatchEvent(event);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not call handler when disabled', () => {
    const handler = vi.fn();
    renderHook(() => useEscapeKey(handler, false));

    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    window.dispatchEvent(event);

    expect(handler).not.toHaveBeenCalled();
  });

  it('does not call handler for non-Escape keys', () => {
    const handler = vi.fn();
    renderHook(() => useEscapeKey(handler, true));

    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    window.dispatchEvent(event);

    expect(handler).not.toHaveBeenCalled();
  });

  it('removes the listener on unmount', () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useEscapeKey(handler, true));

    unmount();

    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    window.dispatchEvent(event);

    expect(handler).not.toHaveBeenCalled();
  });

  it('removes the listener when enabled flips to false', () => {
    const handler = vi.fn();
    const { rerender } = renderHook(({ enabled }) => useEscapeKey(handler, enabled), {
      initialProps: { enabled: true },
    });

    rerender({ enabled: false });

    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    window.dispatchEvent(event);

    expect(handler).not.toHaveBeenCalled();
  });
});
