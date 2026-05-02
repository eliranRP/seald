import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import type { PlacedFieldValue } from '@/components/PlacedField/PlacedField.types';
import { PASTE_OFFSET } from './lib';
import { usePlacement } from './usePlacement';

const f = (overrides: Partial<PlacedFieldValue> & { readonly id: string }): PlacedFieldValue => ({
  page: 1,
  type: 'signature',
  x: 10,
  y: 20,
  signerIds: ['a'],
  ...overrides,
});

interface SetupArgs {
  readonly initialFields: ReadonlyArray<PlacedFieldValue>;
  readonly initialSelected?: ReadonlyArray<string>;
  readonly initialSignerPopoverFor?: string | null;
  readonly initialPagesPopoverFor?: string | null;
  readonly totalPages?: number;
  readonly groupRect?: { readonly page: number } | null;
}

function setup(args: SetupArgs) {
  const onFieldsChangeSpy = vi.fn<(next: ReadonlyArray<PlacedFieldValue>) => void>();
  const pushUndo = vi.fn<(snap: ReadonlyArray<PlacedFieldValue>) => void>();

  const { result } = renderHook(() => {
    const [fields, setFields] = useState<ReadonlyArray<PlacedFieldValue>>(args.initialFields);
    const [selectedIds, setSelectedIds] = useState<ReadonlyArray<string>>(
      args.initialSelected ?? [],
    );
    const [signerPopoverFor, setSignerPopoverFor] = useState<string | null>(
      args.initialSignerPopoverFor ?? null,
    );
    const [pagesPopoverFor, setPagesPopoverFor] = useState<string | null>(
      args.initialPagesPopoverFor ?? null,
    );
    const [groupPagesPopoverOpen, setGroupPagesPopoverOpen] = useState<boolean>(true);
    const handleFieldsChange = (next: ReadonlyArray<PlacedFieldValue>): void => {
      onFieldsChangeSpy(next);
      setFields(next);
    };
    const pagesPopoverField = pagesPopoverFor
      ? fields.find((g) => g.id === pagesPopoverFor)
      : undefined;
    const api = usePlacement({
      fields,
      onFieldsChange: handleFieldsChange,
      pushUndo,
      setSelectedIds,
      selectedIds,
      groupRect: args.groupRect ? { x: 0, y: 0, w: 0, h: 0, page: args.groupRect.page } : null,
      totalPages: args.totalPages ?? 5,
      signerPopoverFor,
      pagesPopoverField,
      setSignerPopoverFor,
      setPagesPopoverFor,
      setGroupPagesPopoverOpen,
    });
    return {
      api,
      fields,
      selectedIds,
      signerPopoverFor,
      pagesPopoverFor,
      groupPagesPopoverOpen,
    };
  });

  return { result, onFieldsChangeSpy, pushUndo };
}

describe('usePlacement.duplicateField', () => {
  it('appends an offset clone, pushes undo, and selects the clone', () => {
    const { result, onFieldsChangeSpy, pushUndo } = setup({
      initialFields: [f({ id: '1', x: 10, y: 20 })],
    });
    act(() => result.current.api.duplicateField('1'));
    expect(pushUndo).toHaveBeenCalledOnce();
    const next = onFieldsChangeSpy.mock.calls[0]![0]!;
    expect(next).toHaveLength(2);
    const clone = next[1]!;
    expect(clone.id).not.toBe('1');
    expect(clone.x).toBe(10 + PASTE_OFFSET);
    expect(clone.y).toBe(20 + PASTE_OFFSET);
    expect(result.current.selectedIds).toEqual([clone.id]);
  });

  it('strips the source `groupId` so the clone is standalone', () => {
    const { result, onFieldsChangeSpy } = setup({
      initialFields: [f({ id: '1', groupId: 'g_a' })],
    });
    act(() => result.current.api.duplicateField('1'));
    const clone = onFieldsChangeSpy.mock.calls[0]![0]![1]!;
    expect('groupId' in clone).toBe(false);
  });

  it('is a no-op when the id does not match any field', () => {
    const { result, onFieldsChangeSpy, pushUndo } = setup({ initialFields: [f({ id: '1' })] });
    act(() => result.current.api.duplicateField('missing'));
    expect(onFieldsChangeSpy).not.toHaveBeenCalled();
    expect(pushUndo).not.toHaveBeenCalled();
  });
});

describe('usePlacement.applySignerSelection', () => {
  it('with 1 signer, updates signerIds in place and closes the popover', () => {
    const { result, onFieldsChangeSpy } = setup({
      initialFields: [f({ id: '1', signerIds: ['a'] })],
      initialSignerPopoverFor: '1',
    });
    act(() => result.current.api.applySignerSelection(['b']));
    const next = onFieldsChangeSpy.mock.calls[0]![0]!;
    expect(next[0]!.signerIds).toEqual(['b']);
    expect(result.current.signerPopoverFor).toBeNull();
  });

  it('with 0 signers, updates signerIds to empty (still single field)', () => {
    const { result, onFieldsChangeSpy } = setup({
      initialFields: [f({ id: '1', signerIds: ['a'] })],
      initialSignerPopoverFor: '1',
    });
    act(() => result.current.api.applySignerSelection([]));
    const next = onFieldsChangeSpy.mock.calls[0]![0]!;
    expect(next[0]!.signerIds).toEqual([]);
  });

  it('with 2+ signers, splits the source into N side-by-side ungrouped tiles', () => {
    const { result, onFieldsChangeSpy } = setup({
      initialFields: [f({ id: '1', x: 100, y: 50, signerIds: ['a'] })],
      initialSignerPopoverFor: '1',
    });
    act(() => result.current.api.applySignerSelection(['x', 'y']));
    const next = onFieldsChangeSpy.mock.calls[0]![0]!;
    // Source removed; two splits added.
    expect(next).toHaveLength(2);
    expect(next[0]!.signerIds).toEqual(['x']);
    expect(next[1]!.signerIds).toEqual(['y']);
    // Stride = source width (default 132) + gap (8).
    expect(next[1]!.x - next[0]!.x).toBe(140);
    // Splits inherit the source's y.
    expect(next[0]!.y).toBe(50);
    // Selection shifts to the splits.
    expect(result.current.selectedIds).toHaveLength(2);
  });

  it('returns when no popover target is set', () => {
    const { result, onFieldsChangeSpy } = setup({
      initialFields: [f({ id: '1' })],
      initialSignerPopoverFor: null,
    });
    act(() => result.current.api.applySignerSelection(['a']));
    expect(onFieldsChangeSpy).not.toHaveBeenCalled();
  });

  it('clears the popover when the popover target id no longer exists', () => {
    const { result, onFieldsChangeSpy } = setup({
      initialFields: [f({ id: '1' })],
      initialSignerPopoverFor: 'gone',
    });
    act(() => result.current.api.applySignerSelection(['a']));
    expect(onFieldsChangeSpy).not.toHaveBeenCalled();
    expect(result.current.signerPopoverFor).toBeNull();
  });
});

describe('usePlacement.applyPagesSelection', () => {
  it('clones the source onto every other page in `all` mode and writes the linkId everywhere', () => {
    const { result, onFieldsChangeSpy } = setup({
      initialFields: [f({ id: '1', page: 2 })],
      initialPagesPopoverFor: '1',
      totalPages: 4,
    });
    act(() => result.current.api.applyPagesSelection('all'));
    const next = onFieldsChangeSpy.mock.calls[0]![0]!;
    // Source + clones for pages 1, 3, 4 = 4 fields.
    expect(next).toHaveLength(4);
    const linkIds = new Set(next.map((g) => g.linkId));
    expect(linkIds.size).toBe(1);
    expect([...linkIds][0]).toMatch(/^l_/);
    // The originating source carries the same linkId as the clones.
    expect(next.find((g) => g.id === '1')!.linkId).toBe([...linkIds][0]);
  });

  it('reuses the existing source linkId when one is present', () => {
    const { result, onFieldsChangeSpy } = setup({
      initialFields: [f({ id: '1', page: 1, linkId: 'l_existing' })],
      initialPagesPopoverFor: '1',
      totalPages: 3,
    });
    act(() => result.current.api.applyPagesSelection('all'));
    const next = onFieldsChangeSpy.mock.calls[0]![0]!;
    for (const g of next) expect(g.linkId).toBe('l_existing');
  });

  it('closes the popover and emits no change when the resolved target list is empty', () => {
    const { result, onFieldsChangeSpy } = setup({
      initialFields: [f({ id: '1', page: 1 })],
      initialPagesPopoverFor: '1',
      totalPages: 3,
    });
    // mode `this` always returns no targets.
    act(() => result.current.api.applyPagesSelection('this'));
    expect(onFieldsChangeSpy).not.toHaveBeenCalled();
    expect(result.current.pagesPopoverFor).toBeNull();
  });

  it('does nothing when the popover field cannot be found', () => {
    const { result, onFieldsChangeSpy } = setup({
      initialFields: [f({ id: '1' })],
      initialPagesPopoverFor: null,
    });
    act(() => result.current.api.applyPagesSelection('all'));
    expect(onFieldsChangeSpy).not.toHaveBeenCalled();
  });
});

describe('usePlacement.applyGroupPagesSelection', () => {
  it('clones every selected source onto every target page, mints fresh group ids per page when sources share a group, and assigns one linkId per source', () => {
    const { result, onFieldsChangeSpy } = setup({
      initialFields: [
        f({ id: 'a', page: 1, groupId: 'g_src' }),
        f({ id: 'b', page: 1, groupId: 'g_src' }),
        f({ id: 'c', page: 2 }), // unrelated page
      ],
      initialSelected: ['a', 'b'],
      groupRect: { page: 1 },
      totalPages: 3,
    });
    act(() => result.current.api.applyGroupPagesSelection('all'));
    const next = onFieldsChangeSpy.mock.calls[0]![0]!;
    // 3 originals + 2 sources cloned to pages [2, 3] = 4 clones -> 7 total.
    expect(next).toHaveLength(7);
    const clones = next.filter((g) => !['a', 'b', 'c'].includes(g.id));
    expect(clones).toHaveLength(4);
    // Each source carries a stable linkId; clones from the same source share it.
    const sourceALinkId = next.find((g) => g.id === 'a')!.linkId;
    const sourceBLinkId = next.find((g) => g.id === 'b')!.linkId;
    expect(sourceALinkId).not.toBe(sourceBLinkId);
    // Per-page group ids: each target page mints a fresh id distinct from the source group.
    const groupIdsByPage = new Map<number, string>();
    for (const c of clones) {
      const prior = groupIdsByPage.get(c.page);
      if (prior !== undefined) expect(c.groupId).toBe(prior);
      else if (c.groupId !== undefined) groupIdsByPage.set(c.page, c.groupId);
    }
    expect(groupIdsByPage.size).toBe(2);
    for (const id of groupIdsByPage.values()) {
      expect(id).toMatch(/^g_/);
      expect(id).not.toBe('g_src');
    }
    expect(result.current.groupPagesPopoverOpen).toBe(false);
  });

  it('closes the popover when fewer than 2 fields are selected', () => {
    const { result, onFieldsChangeSpy } = setup({
      initialFields: [f({ id: 'a' })],
      initialSelected: ['a'],
      groupRect: { page: 1 },
    });
    act(() => result.current.api.applyGroupPagesSelection('all'));
    expect(onFieldsChangeSpy).not.toHaveBeenCalled();
    expect(result.current.groupPagesPopoverOpen).toBe(false);
  });

  it('closes the popover when the group page is unavailable', () => {
    const { result, onFieldsChangeSpy } = setup({
      initialFields: [f({ id: 'a' }), f({ id: 'b' })],
      initialSelected: ['a', 'b'],
      groupRect: null,
    });
    act(() => result.current.api.applyGroupPagesSelection('all'));
    expect(onFieldsChangeSpy).not.toHaveBeenCalled();
    expect(result.current.groupPagesPopoverOpen).toBe(false);
  });

  it('closes the popover when target page list is empty (mode `this`)', () => {
    const { result, onFieldsChangeSpy } = setup({
      initialFields: [f({ id: 'a', page: 1 }), f({ id: 'b', page: 1 })],
      initialSelected: ['a', 'b'],
      groupRect: { page: 1 },
      totalPages: 3,
    });
    act(() => result.current.api.applyGroupPagesSelection('this'));
    expect(onFieldsChangeSpy).not.toHaveBeenCalled();
    expect(result.current.groupPagesPopoverOpen).toBe(false);
  });

  it('closes the popover when the selection is on a different page than the group rect', () => {
    const { result, onFieldsChangeSpy } = setup({
      initialFields: [f({ id: 'a', page: 1 }), f({ id: 'b', page: 1 })],
      initialSelected: ['a', 'b'],
      // Group rect declares page 5 — no source fields live there.
      groupRect: { page: 5 },
      totalPages: 6,
    });
    act(() => result.current.api.applyGroupPagesSelection('all'));
    expect(onFieldsChangeSpy).not.toHaveBeenCalled();
    expect(result.current.groupPagesPopoverOpen).toBe(false);
  });
});
