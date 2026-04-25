import { useCallback, useEffect } from 'react';
import type { PlacedFieldValue } from '@/components/PlacedField/PlacedField.types';
import { PASTE_OFFSET, makeId } from './lib';

interface UseEditorKeyboardArgs {
  readonly fields: ReadonlyArray<PlacedFieldValue>;
  readonly onFieldsChange: (next: ReadonlyArray<PlacedFieldValue>) => void;
  readonly pushUndo: (snapshot: ReadonlyArray<PlacedFieldValue>) => void;
  readonly clipboardRef: React.MutableRefObject<ReadonlyArray<PlacedFieldValue>>;
  readonly hasUndo: () => boolean;
  readonly hasClipboard: () => boolean;
  readonly undo: () => void;
  readonly currentPage: number;
  readonly selectedIds: ReadonlyArray<string>;
  readonly setSelectedIds: React.Dispatch<React.SetStateAction<ReadonlyArray<string>>>;
  readonly requestRemove: (ids: ReadonlyArray<string>) => void;
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly resetZoom: () => void;
}

interface UseEditorKeyboardReturn {
  readonly copySelection: () => void;
  readonly pasteClipboard: () => void;
  readonly removeSelection: () => void;
}

/**
 * Keyboard shortcuts + copy/paste/remove-selection commands for the
 * document editor:
 *
 *   Cmd/Ctrl+C   Copy selection to internal clipboard
 *   Cmd/Ctrl+V   Paste clipboard onto current page (with offset)
 *   Cmd/Ctrl+Z   Undo last discrete mutation
 *   Delete/Backspace   Remove selected fields (routes via requestRemove
 *                       so linked copies prompt for scope)
 *   Cmd/Ctrl + (= / + / - / 0)   Zoom in/out/reset
 *
 * Skips dispatch when the user is typing in an input/textarea/contentEditable
 * so popover filters and inline editors aren't hijacked.
 */
export function useEditorKeyboard({
  fields,
  onFieldsChange,
  pushUndo,
  clipboardRef,
  hasUndo,
  hasClipboard,
  undo,
  currentPage,
  selectedIds,
  setSelectedIds,
  requestRemove,
  zoomIn,
  zoomOut,
  resetZoom,
}: UseEditorKeyboardArgs): UseEditorKeyboardReturn {
  const copySelection = useCallback((): void => {
    if (selectedIds.length === 0) return;
    const picked = fields.filter((f) => selectedIds.includes(f.id));
    if (picked.length === 0) return;
    // eslint-disable-next-line no-param-reassign -- writing to a passed-in ref's `.current` is the standard React idiom for ref-shared state.
    clipboardRef.current = picked;
  }, [clipboardRef, fields, selectedIds]);

  const pasteClipboard = useCallback((): void => {
    const clip = clipboardRef.current;
    if (clip.length === 0) return;
    const clones: ReadonlyArray<PlacedFieldValue> = clip.map((f) => ({
      ...f,
      id: makeId(),
      page: currentPage,
      x: f.x + PASTE_OFFSET,
      y: f.y + PASTE_OFFSET,
    }));
    pushUndo(fields);
    onFieldsChange([...fields, ...clones]);
    setSelectedIds(clones.map((f) => f.id));
  }, [clipboardRef, currentPage, fields, onFieldsChange, pushUndo, setSelectedIds]);

  const removeSelection = useCallback((): void => {
    if (selectedIds.length === 0) return;
    requestRemove(selectedIds);
  }, [requestRemove, selectedIds]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTyping =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        (target?.isContentEditable ?? false);
      if (isTyping) return;

      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === 'c' || e.key === 'C')) {
        if (selectedIds.length === 0) return;
        e.preventDefault();
        copySelection();
        return;
      }
      if (mod && (e.key === 'v' || e.key === 'V')) {
        if (!hasClipboard()) return;
        e.preventDefault();
        pasteClipboard();
        return;
      }
      if (mod && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        if (!hasUndo()) return;
        e.preventDefault();
        undo();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.length === 0) return;
        e.preventDefault();
        removeSelection();
        return;
      }
      if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        zoomIn();
        return;
      }
      if (mod && e.key === '-') {
        e.preventDefault();
        zoomOut();
        return;
      }
      if (mod && e.key === '0') {
        e.preventDefault();
        resetZoom();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    copySelection,
    hasClipboard,
    hasUndo,
    pasteClipboard,
    removeSelection,
    resetZoom,
    selectedIds,
    undo,
    zoomIn,
    zoomOut,
  ]);

  return { copySelection, pasteClipboard, removeSelection };
}
