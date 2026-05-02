import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { PlacedFieldValue } from '@/components/PlacedField/PlacedField.types';
import { FIELD_HEIGHT, SNAP_THRESHOLD } from './lib';
import { useFieldMutations } from './useFieldMutations';

const f = (overrides: Partial<PlacedFieldValue> & { readonly id: string }): PlacedFieldValue => ({
  page: 1,
  type: 'signature',
  x: 0,
  y: 0,
  signerIds: ['a'],
  ...overrides,
});

describe('useFieldMutations.moveField', () => {
  it('translates a single field to the requested coordinates when no peer is in snap range', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      f({ id: '1', x: 10, y: 10 }),
      f({ id: '2', x: 500, y: 500 }), // far away — no snap
    ];
    const onFieldsChange = vi.fn<(next: ReadonlyArray<PlacedFieldValue>) => void>();
    const { result } = renderHook(() =>
      useFieldMutations({ fields, onFieldsChange, selectedIds: ['1'] }),
    );
    act(() => result.current.moveField('1', 100, 200));
    const next = onFieldsChange.mock.calls[0]![0]!;
    expect(next.find((g) => g.id === '1')).toMatchObject({ x: 100, y: 200 });
    expect(result.current.snapGuides).toEqual([]);
  });

  it("snaps to a peer's left edge when within SNAP_THRESHOLD and surfaces a v-guide", () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      f({ id: '1', x: 0, y: 0 }),
      f({ id: '2', x: 200, y: 50 }),
    ];
    const onFieldsChange = vi.fn<(next: ReadonlyArray<PlacedFieldValue>) => void>();
    const { result } = renderHook(() =>
      useFieldMutations({ fields, onFieldsChange, selectedIds: ['1'] }),
    );
    // Request x = 200 - (SNAP_THRESHOLD - 1) -> within the threshold of peer.x (200).
    act(() => result.current.moveField('1', 200 - (SNAP_THRESHOLD - 1), 50));
    const moved = onFieldsChange.mock.calls[0]![0]!.find((g) => g.id === '1')!;
    expect(moved.x).toBe(200);
    expect(result.current.snapGuides).toContainEqual({ orientation: 'v', pos: 200, page: 1 });
  });

  it('moves the entire selection by the same delta when the dragged field is part of a multi-selection', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      f({ id: '1', x: 10, y: 10 }),
      f({ id: '2', x: 30, y: 30 }),
      f({ id: '3', x: 999, y: 999 }), // not selected
    ];
    const onFieldsChange = vi.fn<(next: ReadonlyArray<PlacedFieldValue>) => void>();
    const { result } = renderHook(() =>
      useFieldMutations({ fields, onFieldsChange, selectedIds: ['1', '2'] }),
    );
    act(() => result.current.moveField('1', 50, 50));
    const next = onFieldsChange.mock.calls[0]![0]!;
    // Anchor moved by (+40, +40); peer moves by the same delta.
    expect(next.find((g) => g.id === '1')).toMatchObject({ x: 50, y: 50 });
    expect(next.find((g) => g.id === '2')).toMatchObject({ x: 70, y: 70 });
    // Unselected field stays put.
    expect(next.find((g) => g.id === '3')).toMatchObject({ x: 999, y: 999 });
  });

  it('does nothing when the requested id does not exist', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [f({ id: '1' })];
    const onFieldsChange = vi.fn<(next: ReadonlyArray<PlacedFieldValue>) => void>();
    const { result } = renderHook(() =>
      useFieldMutations({ fields, onFieldsChange, selectedIds: [] }),
    );
    act(() => result.current.moveField('missing', 10, 10));
    expect(onFieldsChange).not.toHaveBeenCalled();
  });

  it('clearSnapGuides empties the guide list', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      f({ id: '1', x: 0, y: 0 }),
      f({ id: '2', x: 100, y: 0 }),
    ];
    const onFieldsChange = vi.fn<(next: ReadonlyArray<PlacedFieldValue>) => void>();
    const { result } = renderHook(() =>
      useFieldMutations({ fields, onFieldsChange, selectedIds: ['1'] }),
    );
    act(() => result.current.moveField('1', 100, 0));
    expect(result.current.snapGuides.length).toBeGreaterThan(0);
    act(() => result.current.clearSnapGuides());
    expect(result.current.snapGuides).toEqual([]);
  });

  it('snaps on the right-edge alignment branch (x + w == peer.x + peer.w)', () => {
    // Peer is wider than `me` so the left-edge branch (x near peer.x) and
    // right-edge branch (x + w near peer.x + peer.w) can be triggered
    // independently. Default `me` width is 132; give peer width 200 with
    // x = 50 -> peer right edge = 250. Target my right edge near 250 with
    // my x = 250 - 132 = 118 (12 px away from peer.x = 50, so the left-edge
    // branch is OUT of snap range, only the right-edge branch fires).
    const fields: ReadonlyArray<PlacedFieldValue> = [
      f({ id: 'peer', x: 50, y: 0, width: 200 }),
      f({ id: 'me', x: 0, y: 0 }),
    ];
    const onFieldsChange = vi.fn<(next: ReadonlyArray<PlacedFieldValue>) => void>();
    const { result } = renderHook(() =>
      useFieldMutations({ fields, onFieldsChange, selectedIds: ['me'] }),
    );
    act(() => result.current.moveField('me', 118 + (SNAP_THRESHOLD - 1), 0));
    const moved = onFieldsChange.mock.calls[0]![0]!.find((g) => g.id === 'me')!;
    expect(moved.x).toBe(118); // snapped so right edges line up at 250
    expect(result.current.snapGuides).toContainEqual({
      orientation: 'v',
      pos: 50 + 200,
      page: 1,
    });
  });

  it('snaps on the vertical center alignment branch', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      f({ id: 'peer', x: 0, y: 100 }),
      f({ id: 'me', x: 200, y: 0 }),
    ];
    const onFieldsChange = vi.fn<(next: ReadonlyArray<PlacedFieldValue>) => void>();
    const { result } = renderHook(() =>
      useFieldMutations({ fields, onFieldsChange, selectedIds: ['me'] }),
    );
    // My center y near peer center y: peer center = 100 + 27 = 127.
    const peerCenter = 100 + FIELD_HEIGHT / 2;
    const myDesiredY = peerCenter - FIELD_HEIGHT / 2 + (SNAP_THRESHOLD - 1);
    act(() => result.current.moveField('me', 200, myDesiredY));
    const moved = onFieldsChange.mock.calls[0]![0]!.find((g) => g.id === 'me')!;
    expect(moved.y).toBe(peerCenter - FIELD_HEIGHT / 2);
    expect(result.current.snapGuides.some((g) => g.orientation === 'h')).toBe(true);
  });
});

describe('useFieldMutations.resizeField', () => {
  it('writes back x/y/width/height verbatim for the matching id only', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      f({ id: '1', x: 0, y: 0 }),
      f({ id: '2', x: 50, y: 50 }),
    ];
    const onFieldsChange = vi.fn<(next: ReadonlyArray<PlacedFieldValue>) => void>();
    const { result } = renderHook(() =>
      useFieldMutations({ fields, onFieldsChange, selectedIds: [] }),
    );
    act(() => result.current.resizeField('1', 5, 6, 200, 80));
    const next = onFieldsChange.mock.calls[0]![0]!;
    expect(next.find((g) => g.id === '1')).toMatchObject({
      x: 5,
      y: 6,
      width: 200,
      height: 80,
    });
    // Untouched.
    expect(next.find((g) => g.id === '2')).toMatchObject({ x: 50, y: 50 });
  });
});

describe('useFieldMutations.toggleRequired', () => {
  it('flips the `required` flag for the matching id', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [f({ id: '1', required: true })];
    const onFieldsChange = vi.fn<(next: ReadonlyArray<PlacedFieldValue>) => void>();
    const { result } = renderHook(() =>
      useFieldMutations({ fields, onFieldsChange, selectedIds: [] }),
    );
    act(() => result.current.toggleRequired('1', false));
    expect(onFieldsChange.mock.calls[0]![0]![0]).toMatchObject({ required: false });
  });
});
