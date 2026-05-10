// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useColumnWidths, type ColumnSpec } from './useColumnWidths';

const SPECS: ReadonlyArray<ColumnSpec> = [
  { key: 'document', default: 320, min: 120 },
  { key: 'signers', default: 220 },
  { key: 'progress', default: 180 },
];

const KEY = 'test.cols.v1';

describe('useColumnWidths', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts at the per-column defaults when storage is empty', () => {
    const { result } = renderHook(() => useColumnWidths(SPECS, KEY));
    expect(result.current.widths).toEqual({ document: 320, signers: 220, progress: 180 });
  });

  it('restores previously-persisted widths on mount', () => {
    localStorage.setItem(KEY, JSON.stringify({ document: 400, signers: 240 }));
    const { result } = renderHook(() => useColumnWidths(SPECS, KEY));
    expect(result.current.widths).toMatchObject({ document: 400, signers: 240, progress: 180 });
  });

  it('falls back to default when a stored value is below the min', () => {
    localStorage.setItem(KEY, JSON.stringify({ document: 50 }));
    const { result } = renderHook(() => useColumnWidths(SPECS, KEY));
    expect(result.current.widths['document']).toBe(320);
  });

  it('setWidth coalesces successive calls into a single rAF flush', () => {
    const { result } = renderHook(() => useColumnWidths(SPECS, KEY));
    act(() => {
      result.current.setWidth('document', 360);
      result.current.setWidth('document', 380);
      result.current.setWidth('document', 410);
    });
    // Pre-flush — state is still the initial value.
    expect(result.current.widths['document']).toBe(320);
    act(() => {
      vi.runAllTimers();
    });
    expect(result.current.widths['document']).toBe(410);
    expect(JSON.parse(localStorage.getItem(KEY) ?? '{}').document).toBe(410);
  });

  it('clamps writes to the per-column min', () => {
    const { result } = renderHook(() => useColumnWidths(SPECS, KEY));
    act(() => {
      result.current.setWidth('document', 50); // below min=120
      vi.runAllTimers();
    });
    expect(result.current.widths['document']).toBe(120);
  });

  it('resetAll clears storage and snaps every column back to its default', () => {
    localStorage.setItem(KEY, JSON.stringify({ document: 500, signers: 300 }));
    const { result } = renderHook(() => useColumnWidths(SPECS, KEY));
    act(() => {
      result.current.resetAll();
    });
    expect(result.current.widths).toEqual({ document: 320, signers: 220, progress: 180 });
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('survives a malformed storage row by falling back to defaults', () => {
    localStorage.setItem(KEY, 'not-json');
    const { result } = renderHook(() => useColumnWidths(SPECS, KEY));
    expect(result.current.widths).toEqual({ document: 320, signers: 220, progress: 180 });
  });
});
