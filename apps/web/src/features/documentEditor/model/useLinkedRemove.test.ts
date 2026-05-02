import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import type { PlacedFieldValue } from '@/components/PlacedField/PlacedField.types';
import { useLinkedRemove } from './useLinkedRemove';

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
}

function setup({ initialFields, initialSelected = [] }: SetupArgs) {
  const onFieldsChangeSpy = vi.fn<(next: ReadonlyArray<PlacedFieldValue>) => void>();
  const pushUndo = vi.fn<(snap: ReadonlyArray<PlacedFieldValue>) => void>();
  const clearSignerPopover = vi.fn();
  const clearPagesPopover = vi.fn();

  const { result } = renderHook(() => {
    const [fields, setFields] = useState<ReadonlyArray<PlacedFieldValue>>(initialFields);
    const [selectedIds, setSelectedIds] = useState<ReadonlyArray<string>>(initialSelected);
    const handleFieldsChange = (next: ReadonlyArray<PlacedFieldValue>): void => {
      onFieldsChangeSpy(next);
      setFields(next);
    };
    const api = useLinkedRemove({
      fields,
      onFieldsChange: handleFieldsChange,
      pushUndo,
      setSelectedIds,
      clearSignerPopover,
      clearPagesPopover,
    });
    return { api, fields, selectedIds };
  });

  return { result, onFieldsChangeSpy, pushUndo, clearSignerPopover, clearPagesPopover };
}

describe('useLinkedRemove.removeByIds', () => {
  it('returns immediately on an empty id list (no undo, no callback)', () => {
    const { result, onFieldsChangeSpy, pushUndo } = setup({
      initialFields: [f({ id: '1' })],
    });
    act(() => result.current.api.removeByIds([]));
    expect(onFieldsChangeSpy).not.toHaveBeenCalled();
    expect(pushUndo).not.toHaveBeenCalled();
  });

  it('drops matching fields, pushes undo, and clears popovers + selection', () => {
    const { result, onFieldsChangeSpy, pushUndo, clearSignerPopover, clearPagesPopover } = setup({
      initialFields: [f({ id: '1' }), f({ id: '2' })],
      initialSelected: ['1', '2'],
    });
    act(() => result.current.api.removeByIds(['1']));
    expect(pushUndo).toHaveBeenCalledOnce();
    const next = onFieldsChangeSpy.mock.calls[0]![0]!;
    expect(next.map((g) => g.id)).toEqual(['2']);
    expect(result.current.selectedIds).toEqual(['2']);
    expect(clearSignerPopover).toHaveBeenCalled();
    expect(clearPagesPopover).toHaveBeenCalled();
  });
});

describe('useLinkedRemove.requestRemove', () => {
  it('removes immediately when no targeted field has a linkId (no dialog)', () => {
    const { result, onFieldsChangeSpy } = setup({
      initialFields: [f({ id: '1' }), f({ id: '2' })],
    });
    act(() => result.current.api.requestRemove(['1']));
    expect(result.current.api.pendingRemove).toBeNull();
    expect(onFieldsChangeSpy).toHaveBeenCalled();
  });

  it('removes immediately when a linkId exists but every linked copy is in the request', () => {
    const { result, onFieldsChangeSpy } = setup({
      initialFields: [f({ id: '1', linkId: 'l_a' }), f({ id: '2', linkId: 'l_a' })],
    });
    act(() => result.current.api.requestRemove(['1', '2']));
    expect(result.current.api.pendingRemove).toBeNull();
    expect(onFieldsChangeSpy).toHaveBeenCalled();
  });

  it('opens the confirm dialog when a linked copy lives outside the request', () => {
    const { result, onFieldsChangeSpy } = setup({
      initialFields: [
        f({ id: '1', linkId: 'l_a' }),
        f({ id: '2', linkId: 'l_a', page: 2 }),
        f({ id: '3' }),
      ],
    });
    act(() => result.current.api.requestRemove(['1']));
    expect(onFieldsChangeSpy).not.toHaveBeenCalled();
    expect(result.current.api.pendingRemove).toEqual({ ids: ['1'] });
    // pendingLinkedCount = both linked copies (1 + sibling on page 2).
    expect(result.current.api.pendingLinkedCount).toBe(2);
  });

  it('returns immediately on an empty id list (no dialog open)', () => {
    const { result } = setup({ initialFields: [f({ id: '1' })] });
    act(() => result.current.api.requestRemove([]));
    expect(result.current.api.pendingRemove).toBeNull();
  });
});

describe('useLinkedRemove.handleRemoveLinkedConfirm', () => {
  it('with scope `only-this`, removes only the originally requested ids and clears the dialog', () => {
    const { result, onFieldsChangeSpy } = setup({
      initialFields: [f({ id: '1', linkId: 'l_a' }), f({ id: '2', linkId: 'l_a', page: 2 })],
    });
    act(() => result.current.api.requestRemove(['1']));
    act(() => result.current.api.handleRemoveLinkedConfirm('only-this'));
    const next = onFieldsChangeSpy.mock.calls.at(-1)![0]!;
    expect(next.map((g) => g.id)).toEqual(['2']);
    expect(result.current.api.pendingRemove).toBeNull();
  });

  it('with scope `all-pages`, removes every linked copy across pages', () => {
    const { result, onFieldsChangeSpy } = setup({
      initialFields: [
        f({ id: '1', linkId: 'l_a' }),
        f({ id: '2', linkId: 'l_a', page: 2 }),
        f({ id: '3', linkId: 'l_a', page: 3 }),
        f({ id: '4' }),
      ],
    });
    act(() => result.current.api.requestRemove(['1']));
    act(() => result.current.api.handleRemoveLinkedConfirm('all-pages'));
    const next = onFieldsChangeSpy.mock.calls.at(-1)![0]!;
    expect(next.map((g) => g.id)).toEqual(['4']);
    expect(result.current.api.pendingRemove).toBeNull();
  });

  it('is a no-op when no remove is pending', () => {
    const { result, onFieldsChangeSpy } = setup({ initialFields: [f({ id: '1' })] });
    act(() => result.current.api.handleRemoveLinkedConfirm('all-pages'));
    expect(onFieldsChangeSpy).not.toHaveBeenCalled();
  });
});

describe('useLinkedRemove.handleRemoveLinkedCancel', () => {
  it('clears the pending dialog without mutating fields', () => {
    const { result, onFieldsChangeSpy } = setup({
      initialFields: [f({ id: '1', linkId: 'l_a' }), f({ id: '2', linkId: 'l_a', page: 2 })],
    });
    act(() => result.current.api.requestRemove(['1']));
    expect(result.current.api.pendingRemove).not.toBeNull();
    act(() => result.current.api.handleRemoveLinkedCancel());
    expect(result.current.api.pendingRemove).toBeNull();
    expect(onFieldsChangeSpy).not.toHaveBeenCalled();
  });
});
