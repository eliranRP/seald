import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRef, useState } from 'react';
import type { PlacedFieldValue } from '@/components/PlacedField/PlacedField.types';
import { PASTE_OFFSET } from './lib';
import { useEditorKeyboard } from './useEditorKeyboard';

const f = (overrides: Partial<PlacedFieldValue> & { readonly id: string }): PlacedFieldValue => ({
  page: 1,
  type: 'signature',
  x: 0,
  y: 0,
  signerIds: ['a'],
  ...overrides,
});

interface SetupArgs {
  readonly initialFields: ReadonlyArray<PlacedFieldValue>;
  readonly initialSelected?: ReadonlyArray<string>;
  readonly initialClipboard?: ReadonlyArray<PlacedFieldValue>;
  readonly currentPage?: number;
  readonly hasUndoValue?: boolean;
}

function setup(args: SetupArgs) {
  const onFieldsChangeSpy = vi.fn<(next: ReadonlyArray<PlacedFieldValue>) => void>();
  const pushUndo = vi.fn();
  const undo = vi.fn();
  const requestRemove = vi.fn<(ids: ReadonlyArray<string>) => void>();
  const zoomIn = vi.fn();
  const zoomOut = vi.fn();
  const resetZoom = vi.fn();

  const { result } = renderHook(() => {
    const [fields, setFields] = useState<ReadonlyArray<PlacedFieldValue>>(args.initialFields);
    const [selectedIds, setSelectedIds] = useState<ReadonlyArray<string>>(
      args.initialSelected ?? [],
    );
    const clipboardRef = useRef<ReadonlyArray<PlacedFieldValue>>(args.initialClipboard ?? []);
    const handleFieldsChange = (next: ReadonlyArray<PlacedFieldValue>): void => {
      onFieldsChangeSpy(next);
      setFields(next);
    };
    const api = useEditorKeyboard({
      fields,
      onFieldsChange: handleFieldsChange,
      pushUndo,
      clipboardRef,
      hasUndo: () => args.hasUndoValue ?? false,
      hasClipboard: () => clipboardRef.current.length > 0,
      undo,
      currentPage: args.currentPage ?? 1,
      selectedIds,
      setSelectedIds,
      requestRemove,
      zoomIn,
      zoomOut,
      resetZoom,
    });
    return { api, fields, selectedIds, clipboardRef };
  });

  return { result, onFieldsChangeSpy, pushUndo, undo, requestRemove, zoomIn, zoomOut, resetZoom };
}

function dispatchKey(opts: KeyboardEventInit & { readonly tag?: string } = {}): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...opts });
  // Some test cases want a "typing in input" target so the hook bails.
  if (opts.tag) {
    const target = document.createElement(opts.tag);
    document.body.appendChild(target);
    Object.defineProperty(ev, 'target', { value: target });
  }
  window.dispatchEvent(ev);
  return ev;
}

describe('useEditorKeyboard imperative API', () => {
  it('copySelection writes to the clipboard ref', () => {
    const { result } = setup({
      initialFields: [f({ id: '1' }), f({ id: '2' })],
      initialSelected: ['1'],
    });
    act(() => result.current.api.copySelection());
    expect(result.current.clipboardRef.current).toHaveLength(1);
    expect(result.current.clipboardRef.current[0]!.id).toBe('1');
  });

  it('copySelection is a no-op when nothing is selected', () => {
    const { result } = setup({ initialFields: [f({ id: '1' })], initialSelected: [] });
    act(() => result.current.api.copySelection());
    expect(result.current.clipboardRef.current).toHaveLength(0);
  });

  it('pasteClipboard duplicates the clipboard onto the current page with offset and selects clones', () => {
    const { result, onFieldsChangeSpy, pushUndo } = setup({
      initialFields: [],
      initialClipboard: [f({ id: 'src', x: 100, y: 50 })],
      currentPage: 3,
    });
    act(() => result.current.api.pasteClipboard());
    expect(pushUndo).toHaveBeenCalledOnce();
    const next = onFieldsChangeSpy.mock.calls[0]![0]!;
    expect(next).toHaveLength(1);
    expect(next[0]!.page).toBe(3);
    expect(next[0]!.x).toBe(100 + PASTE_OFFSET);
    expect(next[0]!.y).toBe(50 + PASTE_OFFSET);
    expect(result.current.selectedIds).toEqual([next[0]!.id]);
  });

  it('pasteClipboard is a no-op on an empty clipboard', () => {
    const { result, onFieldsChangeSpy } = setup({ initialFields: [] });
    act(() => result.current.api.pasteClipboard());
    expect(onFieldsChangeSpy).not.toHaveBeenCalled();
  });

  it('removeSelection routes through requestRemove with the current selection', () => {
    const { result, requestRemove } = setup({
      initialFields: [f({ id: '1' })],
      initialSelected: ['1'],
    });
    act(() => result.current.api.removeSelection());
    expect(requestRemove).toHaveBeenCalledWith(['1']);
  });

  it('removeSelection is a no-op when nothing is selected', () => {
    const { result, requestRemove } = setup({
      initialFields: [f({ id: '1' })],
      initialSelected: [],
    });
    act(() => result.current.api.removeSelection());
    expect(requestRemove).not.toHaveBeenCalled();
  });
});

describe('useEditorKeyboard global keydown handler', () => {
  it('skips dispatch entirely when the event target is an input element', () => {
    const { result, requestRemove } = setup({
      initialFields: [f({ id: '1' })],
      initialSelected: ['1'],
    });
    expect(result.current.api).toBeDefined();
    const ev = dispatchKey({ key: 'Delete', tag: 'INPUT' });
    expect(requestRemove).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });

  it('Cmd+C copies the current selection (and prevents default)', () => {
    const { result } = setup({
      initialFields: [f({ id: '1' }), f({ id: '2' })],
      initialSelected: ['1'],
    });
    const ev = dispatchKey({ key: 'c', metaKey: true });
    expect(ev.defaultPrevented).toBe(true);
    expect(result.current.clipboardRef.current).toHaveLength(1);
  });

  it('Cmd+C with no selection does NOT call preventDefault (lets the OS copy text)', () => {
    setup({ initialFields: [f({ id: '1' })], initialSelected: [] });
    const ev = dispatchKey({ key: 'c', metaKey: true });
    expect(ev.defaultPrevented).toBe(false);
  });

  it('Cmd+V pastes from clipboard when one exists', () => {
    const { onFieldsChangeSpy } = setup({
      initialFields: [],
      initialClipboard: [f({ id: 'src' })],
    });
    const ev = dispatchKey({ key: 'v', ctrlKey: true });
    expect(ev.defaultPrevented).toBe(true);
    expect(onFieldsChangeSpy).toHaveBeenCalled();
  });

  it('Cmd+V with empty clipboard does nothing', () => {
    const { onFieldsChangeSpy } = setup({ initialFields: [] });
    const ev = dispatchKey({ key: 'v', ctrlKey: true });
    expect(ev.defaultPrevented).toBe(false);
    expect(onFieldsChangeSpy).not.toHaveBeenCalled();
  });

  it('Cmd+Z runs undo when hasUndo() is true', () => {
    const { undo } = setup({ initialFields: [], hasUndoValue: true });
    const ev = dispatchKey({ key: 'z', metaKey: true });
    expect(ev.defaultPrevented).toBe(true);
    expect(undo).toHaveBeenCalled();
  });

  it('Cmd+Shift+Z does NOT trigger undo (reserved for redo)', () => {
    const { undo } = setup({ initialFields: [], hasUndoValue: true });
    dispatchKey({ key: 'z', metaKey: true, shiftKey: true });
    expect(undo).not.toHaveBeenCalled();
  });

  it('Delete removes selection via requestRemove', () => {
    const { requestRemove } = setup({
      initialFields: [f({ id: '1' })],
      initialSelected: ['1'],
    });
    const ev = dispatchKey({ key: 'Delete' });
    expect(ev.defaultPrevented).toBe(true);
    expect(requestRemove).toHaveBeenCalledWith(['1']);
  });

  it('Backspace also removes selection', () => {
    const { requestRemove } = setup({
      initialFields: [f({ id: '1' })],
      initialSelected: ['1'],
    });
    dispatchKey({ key: 'Backspace' });
    expect(requestRemove).toHaveBeenCalled();
  });

  it('Cmd+= triggers zoomIn, Cmd+- triggers zoomOut, Cmd+0 resets', () => {
    const { zoomIn, zoomOut, resetZoom } = setup({ initialFields: [] });
    dispatchKey({ key: '=', ctrlKey: true });
    dispatchKey({ key: '-', ctrlKey: true });
    dispatchKey({ key: '0', ctrlKey: true });
    expect(zoomIn).toHaveBeenCalledOnce();
    expect(zoomOut).toHaveBeenCalledOnce();
    expect(resetZoom).toHaveBeenCalledOnce();
  });

  it('Cmd++ also triggers zoomIn (alternate keycap)', () => {
    const { zoomIn } = setup({ initialFields: [] });
    dispatchKey({ key: '+', ctrlKey: true });
    expect(zoomIn).toHaveBeenCalledOnce();
  });
});
