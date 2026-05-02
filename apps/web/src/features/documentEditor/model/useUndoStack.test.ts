import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { PlacedFieldValue } from '@/components/PlacedField/PlacedField.types';
import { UNDO_HISTORY_LIMIT } from './lib';
import { useUndoStack } from './useUndoStack';

const f = (id: string): PlacedFieldValue => ({
  id,
  page: 1,
  type: 'signature',
  x: 0,
  y: 0,
  signerIds: ['a'],
});

describe('useUndoStack', () => {
  it('starts empty: hasUndo / hasClipboard are false', () => {
    const { result } = renderHook(() => useUndoStack({ onFieldsChange: vi.fn() }));
    expect(result.current.hasUndo()).toBe(false);
    expect(result.current.hasClipboard()).toBe(false);
  });

  it('pushUndo grows the stack and undo() pops the last snapshot back to the consumer', () => {
    const onFieldsChange = vi.fn<(next: ReadonlyArray<PlacedFieldValue>) => void>();
    const onUndoApplied = vi.fn<(next: ReadonlyArray<PlacedFieldValue>) => void>();
    const { result } = renderHook(() => useUndoStack({ onFieldsChange, onUndoApplied }));

    const snapA = [f('1')];
    const snapB = [f('1'), f('2')];
    act(() => {
      result.current.pushUndo(snapA);
      result.current.pushUndo(snapB);
    });
    expect(result.current.hasUndo()).toBe(true);

    act(() => {
      result.current.undo();
    });
    // Last-in / first-out — popped snap is `snapB`, callback fires with it.
    expect(onFieldsChange).toHaveBeenLastCalledWith(snapB);
    expect(onUndoApplied).toHaveBeenLastCalledWith(snapB);

    act(() => {
      result.current.undo();
    });
    expect(onFieldsChange).toHaveBeenLastCalledWith(snapA);
    expect(result.current.hasUndo()).toBe(false);
  });

  it('undo() is a no-op (no callback fires) when the stack is empty', () => {
    const onFieldsChange = vi.fn();
    const { result } = renderHook(() => useUndoStack({ onFieldsChange }));
    act(() => {
      result.current.undo();
    });
    expect(onFieldsChange).not.toHaveBeenCalled();
  });

  it('caps history at UNDO_HISTORY_LIMIT — oldest snapshots are dropped', () => {
    const onFieldsChange = vi.fn<(next: ReadonlyArray<PlacedFieldValue>) => void>();
    const { result } = renderHook(() => useUndoStack({ onFieldsChange }));

    // Push limit + 5 snapshots so the first 5 are evicted.
    const total = UNDO_HISTORY_LIMIT + 5;
    act(() => {
      for (let i = 0; i < total; i += 1) result.current.pushUndo([f(String(i))]);
    });
    // Pop everything; the first restored snap is the LAST pushed,
    // and the LAST restored snap is index `total - UNDO_HISTORY_LIMIT`
    // (i.e. 5) since indices 0..4 were evicted.
    act(() => {
      for (let i = 0; i < UNDO_HISTORY_LIMIT; i += 1) result.current.undo();
    });
    expect(onFieldsChange).toHaveBeenCalledTimes(UNDO_HISTORY_LIMIT);
    const lastCall = onFieldsChange.mock.calls.at(-1)!;
    expect(lastCall[0][0]!.id).toBe(String(total - UNDO_HISTORY_LIMIT));
    expect(result.current.hasUndo()).toBe(false);
  });

  it('clipboardRef is independent state — writing to it lights up hasClipboard', () => {
    const { result } = renderHook(() => useUndoStack({ onFieldsChange: vi.fn() }));
    expect(result.current.hasClipboard()).toBe(false);
    act(() => {
      result.current.clipboardRef.current = [f('clip')];
    });
    expect(result.current.hasClipboard()).toBe(true);
  });
});
