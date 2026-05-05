import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '../lib';
import { useCanvasZoom } from '../useCanvasZoom';

describe('useCanvasZoom', () => {
  it('starts at the default zoom and reports neither boundary disabled', () => {
    const { result } = renderHook(() => useCanvasZoom());
    expect(result.current.zoom).toBe(ZOOM_DEFAULT);
    expect(result.current.zoomInDisabled).toBe(false);
    expect(result.current.zoomOutDisabled).toBe(false);
  });

  it('zoomIn / zoomOut step by ZOOM_STEP and stay within [ZOOM_MIN, ZOOM_MAX]', () => {
    const { result } = renderHook(() => useCanvasZoom());

    act(() => result.current.zoomIn());
    expect(result.current.zoom).toBeCloseTo(ZOOM_DEFAULT + ZOOM_STEP, 5);

    act(() => result.current.zoomOut());
    expect(result.current.zoom).toBeCloseTo(ZOOM_DEFAULT, 5);
  });

  it('resetZoom returns to ZOOM_DEFAULT regardless of the current value', () => {
    const { result } = renderHook(() => useCanvasZoom());
    act(() => {
      result.current.zoomIn();
      result.current.zoomIn();
    });
    expect(result.current.zoom).toBeCloseTo(ZOOM_DEFAULT + ZOOM_STEP * 2, 5);
    act(() => result.current.resetZoom());
    expect(result.current.zoom).toBe(ZOOM_DEFAULT);
  });

  it('disables `zoomIn` once the value has clamped at ZOOM_MAX', () => {
    const { result } = renderHook(() => useCanvasZoom());
    // Step until the underlying clampZoom hits the ceiling — guard against
    // a runaway loop with a generous bound.
    act(() => {
      for (let i = 0; i < 50 && result.current.zoom < ZOOM_MAX; i += 1) result.current.zoomIn();
    });
    expect(result.current.zoom).toBe(ZOOM_MAX);
    expect(result.current.zoomInDisabled).toBe(true);
  });

  it('disables `zoomOut` once the value has clamped at ZOOM_MIN', () => {
    const { result } = renderHook(() => useCanvasZoom());
    act(() => {
      for (let i = 0; i < 50 && result.current.zoom > ZOOM_MIN; i += 1) result.current.zoomOut();
    });
    expect(result.current.zoom).toBe(ZOOM_MIN);
    expect(result.current.zoomOutDisabled).toBe(true);
  });
});
