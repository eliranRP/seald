import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { DragEvent } from 'react';
import type { PlacedFieldValue } from '@/components/PlacedField/PlacedField.types';
import type { DocumentPageSigner } from '@/pages/DocumentPage/DocumentPage.types';
import { useCanvasDnd } from './useCanvasDnd';

function makeSigner(id: string): DocumentPageSigner {
  return { id, name: id, email: `${id}@seald.app`, color: '#818CF8' };
}

// Stub canvas div with a getBoundingClientRect — `useCanvasDnd` reads
// it through the `canvasRefsRef` map to convert client coords into
// page-local coords.
function makeCanvas(): HTMLDivElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: 600,
      bottom: 800,
      x: 0,
      y: 0,
      width: 600,
      height: 800,
      toJSON() {
        return {};
      },
    }) as DOMRect;
  return el;
}

// Minimal DragEvent stand-in. The hook only reads `clientX`,
// `clientY`, calls `preventDefault`, and uses `dataTransfer` (which
// is allowed to throw in jsdom).
function makeDropEvent(clientX: number, clientY: number): DragEvent<HTMLDivElement> {
  return {
    clientX,
    clientY,
    preventDefault: vi.fn(),
    dataTransfer: { dropEffect: 'copy', effectAllowed: 'copy', setData: vi.fn() },
  } as unknown as DragEvent<HTMLDivElement>;
}

interface RenderArgs {
  readonly signers: ReadonlyArray<DocumentPageSigner>;
}

function renderDnd({ signers }: RenderArgs) {
  const fields: PlacedFieldValue[] = [];
  const onFieldsChange = vi.fn((next: ReadonlyArray<PlacedFieldValue>) => {
    fields.splice(0, fields.length, ...next);
  });
  const pushUndo = vi.fn();
  const setSelectedIds = vi.fn();
  const setSignerPopoverFor = vi.fn();
  const setPagesPopoverFor = vi.fn();
  const canvas = makeCanvas();
  const canvasRefsRef = { current: new Map<number, HTMLDivElement | null>([[1, canvas]]) };

  const { result } = renderHook(() =>
    useCanvasDnd({
      fields,
      onFieldsChange,
      pushUndo,
      signers,
      canvasRefsRef,
      zoom: 1,
      setSelectedIds,
      setSignerPopoverFor,
      setPagesPopoverFor,
    }),
  );

  return {
    result,
    fields,
    onFieldsChange,
    pushUndo,
    setSelectedIds,
    setSignerPopoverFor,
    setPagesPopoverFor,
  };
}

describe('useCanvasDnd canvas drop', () => {
  // Single-signer case — already correct pre-fix; lock it in so a
  // future change can't quietly stop opening the popover here either.
  it('drops one field pre-assigned to the only signer and opens the popover', () => {
    const { result, onFieldsChange, setSignerPopoverFor } = renderDnd({
      signers: [makeSigner('alice')],
    });

    act(() => {
      // Prime the palette drag (sets the internal kind ref).
      result.current.handlePaletteDragStart('signature', {
        dataTransfer: { setData: vi.fn() },
      } as unknown as DragEvent<HTMLElement>);
      result.current.handleCanvasDrop(makeDropEvent(200, 200), 1);
    });

    expect(onFieldsChange).toHaveBeenCalledOnce();
    const dropped = onFieldsChange.mock.calls[0]![0]!;
    expect(dropped).toHaveLength(1);
    expect(dropped[0]!.signerIds).toEqual(['alice']);
    expect(setSignerPopoverFor).toHaveBeenCalledWith(dropped[0]!.id);
  });

  // Regression for the user-reported bug: dropping a field on a
  // multi-signer document used to silently split into N side-by-side
  // tiles (no popover), leaving no way to assign a single field to
  // just one signer without first deleting the auto-generated extras.
  // Post-fix: one field is dropped pre-selected with both signers and
  // the popover opens so the user picks who the field is for.
  it('drops one field pre-selected with all signers and opens the popover when 2+ signers', () => {
    const { result, onFieldsChange, setSignerPopoverFor } = renderDnd({
      signers: [makeSigner('alice'), makeSigner('bob')],
    });

    act(() => {
      result.current.handlePaletteDragStart('signature', {
        dataTransfer: { setData: vi.fn() },
      } as unknown as DragEvent<HTMLElement>);
      result.current.handleCanvasDrop(makeDropEvent(200, 200), 1);
    });

    expect(onFieldsChange).toHaveBeenCalledOnce();
    const dropped = onFieldsChange.mock.calls[0]![0]!;
    // ONE field, not N — the popover takes care of the
    // pick-which-signers step. `applySignerSelection` (in
    // usePlacement) handles the "user picked 2+" split.
    expect(dropped).toHaveLength(1);
    expect(dropped[0]!.signerIds).toEqual(['alice', 'bob']);
    expect(setSignerPopoverFor).toHaveBeenCalledWith(dropped[0]!.id);
  });

  it('does nothing when the palette drag was never started', () => {
    const { result, onFieldsChange, setSignerPopoverFor } = renderDnd({
      signers: [makeSigner('alice')],
    });

    act(() => {
      result.current.handleCanvasDrop(makeDropEvent(200, 200), 1);
    });

    expect(onFieldsChange).not.toHaveBeenCalled();
    expect(setSignerPopoverFor).not.toHaveBeenCalled();
  });
});
