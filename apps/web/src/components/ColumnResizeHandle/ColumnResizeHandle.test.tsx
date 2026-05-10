import { describe, expect, it, vi } from 'vitest';
import { renderWithTheme } from '../../test/renderWithTheme';
import { ColumnResizeHandle } from './ColumnResizeHandle';

describe('ColumnResizeHandle', () => {
  it('renders with role="separator" and an accessible label', () => {
    const { getByRole } = renderWithTheme(
      <ColumnResizeHandle width={200} onResize={() => {}} ariaLabel="Resize Document column" />,
    );
    const handle = getByRole('separator', { name: /resize document column/i });
    expect(handle).toHaveAttribute('aria-orientation', 'vertical');
  });

  // jsdom's `PointerEvent` constructor ignores `clientX` from the init
  // dict (it only mirrors MouseEvent for the boolean fields). Dispatch
  // a `MouseEvent` retyped as `pointerdown`/etc. — the bubbling /
  // listener path is identical and `clientX` survives the round-trip.
  function dispatchPointer(
    el: HTMLElement,
    type: 'pointerdown' | 'pointermove' | 'pointerup',
    clientX: number,
  ): void {
    const evt = new MouseEvent(type, { bubbles: true, cancelable: true, clientX });
    el.dispatchEvent(evt);
  }

  it('calls onResize with the running new width as the cursor moves', () => {
    const onResize = vi.fn();
    const { getByRole } = renderWithTheme(
      <ColumnResizeHandle width={200} onResize={onResize} ariaLabel="Resize" />,
    );
    const handle = getByRole('separator') as HTMLElement;
    dispatchPointer(handle, 'pointerdown', 100);
    dispatchPointer(handle, 'pointermove', 130);
    expect(onResize).toHaveBeenLastCalledWith(230);
    dispatchPointer(handle, 'pointermove', 80);
    expect(onResize).toHaveBeenLastCalledWith(180);
  });

  it('fires onResizeEnd exactly once on pointer-up', () => {
    const onResize = vi.fn();
    const onResizeEnd = vi.fn();
    const { getByRole } = renderWithTheme(
      <ColumnResizeHandle
        width={200}
        onResize={onResize}
        onResizeEnd={onResizeEnd}
        ariaLabel="Resize"
      />,
    );
    const handle = getByRole('separator') as HTMLElement;
    dispatchPointer(handle, 'pointerdown', 100);
    dispatchPointer(handle, 'pointermove', 120);
    dispatchPointer(handle, 'pointerup', 120);
    expect(onResizeEnd).toHaveBeenCalledTimes(1);
  });

  it('does not fire onResize for pointer-move events without a prior pointer-down', () => {
    const onResize = vi.fn();
    const { getByRole } = renderWithTheme(
      <ColumnResizeHandle width={200} onResize={onResize} ariaLabel="Resize" />,
    );
    dispatchPointer(getByRole('separator') as HTMLElement, 'pointermove', 130);
    expect(onResize).not.toHaveBeenCalled();
  });
});
