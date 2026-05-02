import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { DragEvent, MouseEvent as ReactMouseEvent } from 'react';
import type { PlacedFieldValue } from '@/components/PlacedField/PlacedField.types';
import type { DocumentPageSigner } from '@/pages/DocumentPage/DocumentPage.types';
import { useCanvasDnd } from './useCanvasDnd';

function makeSigner(id: string): DocumentPageSigner {
  return { id, name: id, email: `${id}@seald.app`, color: '#818CF8' };
}
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

function makeDragOver(): DragEvent<HTMLDivElement> {
  return {
    preventDefault: vi.fn(),
    dataTransfer: { dropEffect: 'none' },
  } as unknown as DragEvent<HTMLDivElement>;
}

interface RenderArgs {
  readonly fields?: ReadonlyArray<PlacedFieldValue>;
  readonly signers?: ReadonlyArray<DocumentPageSigner>;
}

function renderDnd({ fields = [], signers = [makeSigner('alice')] }: RenderArgs = {}) {
  const fieldsRef = [...fields];
  const onFieldsChange = vi.fn((next: ReadonlyArray<PlacedFieldValue>) => {
    fieldsRef.splice(0, fieldsRef.length, ...next);
  });
  const pushUndo = vi.fn();
  const setSelectedIds = vi.fn();
  const setSignerPopoverFor = vi.fn();
  const setPagesPopoverFor = vi.fn();
  const canvas = makeCanvas();
  const canvasRefsRef = { current: new Map<number, HTMLDivElement | null>([[1, canvas]]) };

  const { result } = renderHook(() =>
    useCanvasDnd({
      fields: fieldsRef,
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
    canvas,
    onFieldsChange,
    pushUndo,
    setSelectedIds,
    setSignerPopoverFor,
    setPagesPopoverFor,
  };
}

describe('useCanvasDnd.handleCanvasDragOver', () => {
  it('calls preventDefault and sets dropEffect=copy when a palette drag is active', () => {
    const { result } = renderDnd();
    const ev = makeDragOver();
    act(() => {
      result.current.handlePaletteDragStart('signature', {
        dataTransfer: { setData: vi.fn() },
      } as unknown as DragEvent<HTMLElement>);
      result.current.handleCanvasDragOver(ev);
    });
    expect(ev.preventDefault as ReturnType<typeof vi.fn>).toHaveBeenCalled();
    expect(ev.dataTransfer.dropEffect).toBe('copy');
  });

  it('is a no-op when no palette drag is active (preserves browser default)', () => {
    const { result } = renderDnd();
    const ev = makeDragOver();
    act(() => result.current.handleCanvasDragOver(ev));
    expect(ev.preventDefault as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });
});

describe('useCanvasDnd.handlePaletteDragEnd', () => {
  it('clears the active drag kind so a subsequent drop without dragstart is rejected', () => {
    const { result, onFieldsChange } = renderDnd();
    act(() => {
      result.current.handlePaletteDragStart('signature', {
        dataTransfer: { setData: vi.fn() },
      } as unknown as DragEvent<HTMLElement>);
      result.current.handlePaletteDragEnd();
      result.current.handleCanvasDrop(
        {
          clientX: 100,
          clientY: 100,
          preventDefault: vi.fn(),
          dataTransfer: { dropEffect: 'copy' },
        } as unknown as DragEvent<HTMLDivElement>,
        1,
      );
    });
    expect(onFieldsChange).not.toHaveBeenCalled();
  });
});

describe('useCanvasDnd.handleCanvasBackgroundClick', () => {
  it('clears the selection on a plain background click', () => {
    const { result, setSelectedIds } = renderDnd();
    act(() => result.current.handleCanvasBackgroundClick());
    expect(setSelectedIds).toHaveBeenCalledWith([]);
  });

  it('skips the synthetic click that follows a marquee mouseup', () => {
    const { result, setSelectedIds } = renderDnd({
      fields: [
        {
          id: '1',
          page: 1,
          type: 'signature',
          x: 50,
          y: 50,
          signerIds: ['alice'],
        },
      ],
    });
    // Drive a marquee that lands on the existing field so
    // suppressNextBgClickRef is armed.
    const evDown = {
      button: 0,
      clientX: 0,
      clientY: 0,
    } as unknown as ReactMouseEvent<HTMLDivElement>;
    act(() => result.current.handleCanvasMouseDown(evDown, 1));
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 200 }));
      window.dispatchEvent(new MouseEvent('mouseup'));
    });
    setSelectedIds.mockClear();

    // Now the synthetic background click should be suppressed and selection
    // must not be cleared.
    act(() => result.current.handleCanvasBackgroundClick());
    expect(setSelectedIds).not.toHaveBeenCalled();

    // A SECOND background click should once again clear the selection
    // (suppress flag is single-use).
    act(() => result.current.handleCanvasBackgroundClick());
    expect(setSelectedIds).toHaveBeenCalledWith([]);
  });
});

describe('useCanvasDnd.handleCanvasMouseDown / marquee', () => {
  it('ignores non-left-button mousedowns', () => {
    const { result, setSelectedIds } = renderDnd();
    const ev = { button: 2, clientX: 0, clientY: 0 } as unknown as ReactMouseEvent<HTMLDivElement>;
    act(() => result.current.handleCanvasMouseDown(ev, 1));
    // No subsequent drag — selection untouched.
    expect(setSelectedIds).not.toHaveBeenCalled();
  });

  it('lassos a same-page field when the marquee rectangle covers it', () => {
    const { result, setSelectedIds } = renderDnd({
      fields: [
        {
          id: 'inside',
          page: 1,
          type: 'signature',
          x: 80,
          y: 80,
          signerIds: ['alice'],
        },
        {
          id: 'far',
          page: 1,
          type: 'signature',
          x: 1000,
          y: 1000,
          signerIds: ['alice'],
        },
        {
          id: 'wrong-page',
          page: 2,
          type: 'signature',
          x: 80,
          y: 80,
          signerIds: ['alice'],
        },
      ],
    });
    const evDown = {
      button: 0,
      clientX: 50,
      clientY: 50,
    } as unknown as ReactMouseEvent<HTMLDivElement>;
    act(() => result.current.handleCanvasMouseDown(evDown, 1));
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 250, clientY: 250 }));
      window.dispatchEvent(new MouseEvent('mouseup'));
    });
    expect(setSelectedIds).toHaveBeenCalledWith(['inside']);
  });

  it('expands the lasso to include every field in the captured persistent group', () => {
    const { result, setSelectedIds } = renderDnd({
      fields: [
        {
          id: 'a',
          page: 1,
          type: 'signature',
          x: 80,
          y: 80,
          signerIds: ['alice'],
          groupId: 'g_x',
        },
        {
          id: 'b',
          page: 1,
          type: 'signature',
          x: 400,
          y: 400, // outside the marquee
          signerIds: ['alice'],
          groupId: 'g_x',
        },
      ],
    });
    const evDown = {
      button: 0,
      clientX: 50,
      clientY: 50,
    } as unknown as ReactMouseEvent<HTMLDivElement>;
    act(() => result.current.handleCanvasMouseDown(evDown, 1));
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 250, clientY: 250 }));
      window.dispatchEvent(new MouseEvent('mouseup'));
    });
    const selection = setSelectedIds.mock.calls.at(-1)![0];
    expect(new Set(selection)).toEqual(new Set(['a', 'b']));
  });

  it('does nothing on mouseup when the pointer never traveled past MARQUEE_THRESHOLD', () => {
    const { result, setSelectedIds } = renderDnd({
      fields: [
        {
          id: 'inside',
          page: 1,
          type: 'signature',
          x: 0,
          y: 0,
          signerIds: ['alice'],
        },
      ],
    });
    const evDown = {
      button: 0,
      clientX: 50,
      clientY: 50,
    } as unknown as ReactMouseEvent<HTMLDivElement>;
    act(() => result.current.handleCanvasMouseDown(evDown, 1));
    act(() => {
      // 1px of movement — below MARQUEE_THRESHOLD = 3.
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 51, clientY: 50 }));
      window.dispatchEvent(new MouseEvent('mouseup'));
    });
    expect(setSelectedIds).not.toHaveBeenCalled();
  });

  it('bails when the canvas ref for the supplied page is missing', () => {
    const onFieldsChange = vi.fn();
    const setSelectedIds = vi.fn();
    const canvasRefsRef = { current: new Map<number, HTMLDivElement | null>() };
    const { result } = renderHook(() =>
      useCanvasDnd({
        fields: [],
        onFieldsChange,
        pushUndo: vi.fn(),
        signers: [],
        canvasRefsRef,
        zoom: 1,
        setSelectedIds,
        setSignerPopoverFor: vi.fn(),
        setPagesPopoverFor: vi.fn(),
      }),
    );
    act(() =>
      result.current.handleCanvasMouseDown(
        { button: 0, clientX: 0, clientY: 0 } as unknown as ReactMouseEvent<HTMLDivElement>,
        1,
      ),
    );
    expect(setSelectedIds).not.toHaveBeenCalled();
  });
});
