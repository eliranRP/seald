import { useCallback, useRef } from 'react';
import type { PlacedFieldValue } from '@/components/PlacedField/PlacedField.types';
import { UNDO_HISTORY_LIMIT } from './lib';

function capped(
  stack: ReadonlyArray<ReadonlyArray<PlacedFieldValue>>,
): ReadonlyArray<ReadonlyArray<PlacedFieldValue>> {
  return stack.length > UNDO_HISTORY_LIMIT ? stack.slice(stack.length - UNDO_HISTORY_LIMIT) : stack;
}

interface UseUndoStackArgs {
  /** The fields on screen now; needed so Redo can come back to them after an Undo. */
  readonly fields?: ReadonlyArray<PlacedFieldValue> | undefined;
  readonly onFieldsChange: (next: ReadonlyArray<PlacedFieldValue>) => void;
  readonly onUndoApplied?: (restored: ReadonlyArray<PlacedFieldValue>) => void;
}

interface UseUndoStackReturn {
  readonly pushUndo: (snapshot: ReadonlyArray<PlacedFieldValue>) => void;
  readonly undo: () => void;
  readonly hasUndo: () => boolean;
  readonly redo: () => void;
  readonly hasRedo: () => boolean;
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
  fields,
  onFieldsChange,
  onUndoApplied,
}: UseUndoStackArgs): UseUndoStackReturn {
  const undoStackRef = useRef<ReadonlyArray<ReadonlyArray<PlacedFieldValue>>>([]);
  const redoStackRef = useRef<ReadonlyArray<ReadonlyArray<PlacedFieldValue>>>([]);
  const clipboardRef = useRef<ReadonlyArray<PlacedFieldValue>>([]);
  const fieldsRef = useRef<ReadonlyArray<PlacedFieldValue> | undefined>(fields);
  fieldsRef.current = fields;

  // A new edit starts a new timeline: whatever was undone can no longer be redone.
  const pushUndo = useCallback((snapshot: ReadonlyArray<PlacedFieldValue>): void => {
    undoStackRef.current = capped([...undoStackRef.current, snapshot]);
    redoStackRef.current = [];
  }, []);

  const undo = useCallback((): void => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const last = stack[stack.length - 1];
    if (!last) return;
    undoStackRef.current = stack.slice(0, -1);
    const now = fieldsRef.current;
    if (now !== undefined) redoStackRef.current = capped([...redoStackRef.current, now]);
    onFieldsChange(last);
    onUndoApplied?.(last);
  }, [onFieldsChange, onUndoApplied]);

  const redo = useCallback((): void => {
    const stack = redoStackRef.current;
    const next = stack[stack.length - 1];
    if (!next) return;
    redoStackRef.current = stack.slice(0, -1);
    const now = fieldsRef.current;
    if (now !== undefined) undoStackRef.current = capped([...undoStackRef.current, now]);
    onFieldsChange(next);
    onUndoApplied?.(next);
  }, [onFieldsChange, onUndoApplied]);

  const hasUndo = useCallback((): boolean => undoStackRef.current.length > 0, []);
  const hasRedo = useCallback((): boolean => redoStackRef.current.length > 0, []);
  const hasClipboard = useCallback((): boolean => clipboardRef.current.length > 0, []);

  return { pushUndo, undo, hasUndo, redo, hasRedo, clipboardRef, hasClipboard };
}
