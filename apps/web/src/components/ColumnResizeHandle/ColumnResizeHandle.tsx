import { forwardRef, useCallback, useRef } from 'react';
import type { PointerEvent } from 'react';
import styled from 'styled-components';

/**
 * Vertical drag handle slotted between two table columns. Mirrors the
 * Monday / Linear UX: hover reveals the handle, mouse-down captures
 * the pointer, mouse-move calls back with the running width, mouse-up
 * persists.
 *
 * Owns no width state — the parent passes the current pixel width in
 * via `width` and we compute new widths from `clientX` deltas. Keeps
 * the handle reusable across the dashboard, settings, etc.
 */

const Handle = styled.span`
  position: absolute;
  top: 0;
  right: -3px;
  bottom: 0;
  width: 6px;
  cursor: col-resize;
  user-select: none;
  z-index: 5;
  display: flex;
  align-items: stretch;
  justify-content: center;
  &::after {
    content: '';
    width: 1px;
    background: transparent;
    transition: background 120ms;
  }
  &:hover::after,
  &[data-active='true']::after {
    background: ${({ theme }) => theme.color.indigo[500]};
  }
`;

export interface ColumnResizeHandleProps {
  /** Current column width in pixels — caller's source of truth. */
  readonly width: number;
  /** Fires on every pointermove with the running new width. */
  readonly onResize: (px: number) => void;
  /** Fires once on pointerup. Persistence hook for the parent. */
  readonly onResizeEnd?: () => void;
  /** Accessible label, e.g. "Resize Document column". */
  readonly ariaLabel: string;
}

export const ColumnResizeHandle = forwardRef<HTMLSpanElement, ColumnResizeHandleProps>(
  (props, ref) => {
    const { width, onResize, onResizeEnd, ariaLabel } = props;
    const startRef = useRef<{ x: number; w: number } | null>(null);
    const elRef = useRef<HTMLSpanElement | null>(null);

    const setActive = useCallback((on: boolean) => {
      if (elRef.current) elRef.current.dataset['active'] = on ? 'true' : 'false';
    }, []);

    const handlePointerDown = useCallback(
      (e: PointerEvent<HTMLSpanElement>) => {
        e.preventDefault();
        e.stopPropagation();
        startRef.current = { x: e.clientX, w: width };
        try {
          // Some test environments (jsdom) don't implement
          // `setPointerCapture`. Wrap in try/catch so a missing
          // implementation doesn't abort the rest of the handler —
          // the move/up listeners still fire on the element itself.
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* no pointer-capture available — drag still works */
        }
        setActive(true);
      },
      [setActive, width],
    );

    const handlePointerMove = useCallback(
      (e: PointerEvent<HTMLSpanElement>) => {
        if (startRef.current === null) return;
        const delta = e.clientX - startRef.current.x;
        onResize(startRef.current.w + delta);
      },
      [onResize],
    );

    const handlePointerUp = useCallback(
      (e: PointerEvent<HTMLSpanElement>) => {
        if (startRef.current === null) return;
        startRef.current = null;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          // Ignore — capture may already have been released by the OS.
        }
        setActive(false);
        if (onResizeEnd) onResizeEnd();
      },
      [onResizeEnd, setActive],
    );

    return (
      <Handle
        ref={(node) => {
          elRef.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
        }}
        role="separator"
        aria-orientation="vertical"
        aria-label={ariaLabel}
        tabIndex={-1}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    );
  },
);
ColumnResizeHandle.displayName = 'ColumnResizeHandle';
