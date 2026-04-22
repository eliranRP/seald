import { forwardRef, useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CollapsibleRailProps } from './CollapsibleRail.types';
import {
  Body,
  CollapsedRoot,
  CollapsedToggle,
  Header,
  HeaderToggle,
  OpenRoot,
  ResizeGrip,
  ResizeHandle,
  TitleText,
  VerticalTitle,
} from './CollapsibleRail.styles';

const DEFAULT_MIN_W = 200;
const DEFAULT_MAX_W = 440;

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export const CollapsibleRail = forwardRef<HTMLElement, CollapsibleRailProps>((props, ref) => {
  const {
    side,
    title,
    open,
    onOpenChange,
    width,
    onWidthChange,
    minW = DEFAULT_MIN_W,
    maxW = DEFAULT_MAX_W,
    noPad = false,
    children,
    ...rest
  } = props;

  const [dragging, setDragging] = useState(false);

  // Keep the latest width in a ref-like closure via state update callback replacement.
  // We use a functional effect approach: read movementX per mousemove and call onWidthChange
  // with the clamped next value based on the current width prop snapshot. Because width is
  // controlled, we compute nextWidth using a local tracker updated on each move.
  useEffect(() => {
    if (!dragging) {
      return undefined;
    }
    let currentWidth = width;
    const handleMove = (e: MouseEvent): void => {
      const delta = side === 'right' ? -e.movementX : e.movementX;
      const next = clamp(currentWidth + delta, minW, maxW);
      if (next !== currentWidth) {
        currentWidth = next;
        onWidthChange(next);
      }
    };
    const handleUp = (): void => {
      setDragging(false);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging, side, minW, maxW, onWidthChange, width]);

  const handleToggle = useCallback((): void => {
    onOpenChange(!open);
  }, [onOpenChange, open]);

  const handleResizeMouseDown = useCallback((): void => {
    setDragging(true);
  }, []);

  const toggleLabel = open ? `Collapse ${title}` : `Expand ${title}`;

  if (!open) {
    const ExpandIcon = side === 'left' ? ChevronRight : ChevronLeft;
    return (
      <CollapsedRoot {...rest} ref={ref} $side={side} aria-label={title}>
        <CollapsedToggle
          type="button"
          aria-label={toggleLabel}
          aria-expanded={false}
          onClick={handleToggle}
        >
          <ExpandIcon size={14} strokeWidth={1.75} aria-hidden />
        </CollapsedToggle>
        <VerticalTitle>{title}</VerticalTitle>
      </CollapsedRoot>
    );
  }

  const CollapseIcon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <OpenRoot {...rest} ref={ref} $side={side} $width={width} aria-label={title}>
      <Header>
        <TitleText>{title}</TitleText>
        <HeaderToggle type="button" aria-label={toggleLabel} aria-expanded onClick={handleToggle}>
          <CollapseIcon size={16} strokeWidth={1.75} aria-hidden />
        </HeaderToggle>
      </Header>
      <Body $noPad={noPad}>{children}</Body>
      <ResizeHandle
        $side={side}
        $dragging={dragging}
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${title}`}
        onMouseDown={handleResizeMouseDown}
      >
        <ResizeGrip $dragging={dragging} />
      </ResizeHandle>
    </OpenRoot>
  );
});

CollapsibleRail.displayName = 'CollapsibleRail';
