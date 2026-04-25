import { useCallback, useRef } from 'react';
import type { PlacedFieldValue } from '@/components/PlacedField/PlacedField.types';
import { UNDO_HISTORY_LIMIT } from './lib';

interface UseUndoStackArgs {
  readonly onFieldsChange: (next: ReadonlyArray<PlacedFieldValue>) => void;
  readonly onUndoApplied?: (restored: ReadonlyArray<PlacedFieldValue>) => void;
}

interface UseUndoStackReturn {
  readonly pushUndo: (snapshot: ReadonlyArray<PlacedFieldValue>) => void;
  readonly undo: () => void;
  readonly hasUndo: () => boolean;
  readonly clipboardRef: React.MutableRefObject<ReadonlyArray<PlacedFieldValue>>;
  readonly hasClipboard: () => boolean;
}

/**
 * Undo history + paste clipboard for the document editor. The undo stack is
 * a ref (not state) so the `pushUndo` callback identity stays stable across
 * the whole editor lifetime — preventing the dependency thrash that would
 * otherwise cascade through every mutation hook.
 *
 * The clipboard is a separate ref because paste doesn't need a render on
 * copy, only on the eventual paste action.
 */
export function useUndoStack({
  onFieldsChange,
  onUndoApplied,
}: UseUndoStackArgs): UseUndoStackReturn {
  const undoStackRef = useRef<ReadonlyArray<ReadonlyArray<PlacedFieldValue>>>([]);
  const clipboardRef = useRef<ReadonlyArray<PlacedFieldValue>>([]);

  const pushUndo = useCallback((snapshot: ReadonlyArray<PlacedFieldValue>): void => {
    const next = [...undoStackRef.current, snapshot];
    undoStackRef.current =
      next.length > UNDO_HISTORY_LIMIT ? next.slice(next.length - UNDO_HISTORY_LIMIT) : next;
  }, []);

  const undo = useCallback((): void => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const last = stack[stack.length - 1];
    if (!last) return;
    undoStackRef.current = stack.slice(0, -1);
    onFieldsChange(last);
    onUndoApplied?.(last);
  }, [onFieldsChange, onUndoApplied]);

  const hasUndo = useCallback((): boolean => undoStackRef.current.length > 0, []);
  const hasClipboard = useCallback((): boolean => clipboardRef.current.length > 0, []);

  return { pushUndo, undo, hasUndo, clipboardRef, hasClipboard };
}
