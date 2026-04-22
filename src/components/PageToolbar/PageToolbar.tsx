import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus, Target } from 'lucide-react';
import type { PageToolbarProps } from './PageToolbar.types';
import { Divider, IconButton, PageIndicator, Root, ZoomPercent } from './PageToolbar.styles';

export const PageToolbar = forwardRef<HTMLDivElement, PageToolbarProps>((props, ref) => {
  const {
    currentPage,
    totalPages,
    onPrevPage,
    onNextPage,
    onJumpToNextZone,
    jumpLabel,
    zoom,
    onZoomIn,
    onZoomOut,
    onResetZoom,
    zoomInDisabled,
    zoomOutDisabled,
    ...rest
  } = props;

  const jumpAriaLabel = jumpLabel ?? 'Jump to next signature line';

  let jumpGroup: ReactNode = null;
  if (onJumpToNextZone) {
    jumpGroup = (
      <>
        <IconButton type="button" aria-label={jumpAriaLabel} onClick={onJumpToNextZone}>
          <Target size={14} aria-hidden />
        </IconButton>
        <Divider aria-hidden />
      </>
    );
  }

  const prevDisabled = currentPage <= 1;
  const nextDisabled = currentPage >= totalPages;

  // The zoom group is only rendered when the caller has opted into zoom by
  // passing a `zoom` value. This keeps existing consumers (page-only toolbar)
  // visually identical and their tests/stories untouched.
  const showZoom = zoom !== undefined;
  const zoomPct = zoom !== undefined ? Math.round(zoom * 100) : 100;

  let zoomGroup: ReactNode = null;
  if (showZoom) {
    zoomGroup = (
      <>
        <Divider aria-hidden />
        <IconButton
          type="button"
          aria-label="Zoom out"
          disabled={zoomOutDisabled ?? !onZoomOut}
          onClick={onZoomOut}
        >
          <Minus size={14} aria-hidden />
        </IconButton>
        <ZoomPercent
          type="button"
          aria-label={`Zoom ${String(zoomPct)}%. Click to reset to 100%.`}
          disabled={!onResetZoom}
          onClick={onResetZoom}
        >
          {zoomPct}%
        </ZoomPercent>
        <IconButton
          type="button"
          aria-label="Zoom in"
          disabled={zoomInDisabled ?? !onZoomIn}
          onClick={onZoomIn}
        >
          <Plus size={14} aria-hidden />
        </IconButton>
      </>
    );
  }

  return (
    <Root ref={ref} {...rest} role="toolbar" aria-label="Page navigation">
      {jumpGroup}
      <IconButton
        type="button"
        aria-label="Previous page"
        disabled={prevDisabled}
        onClick={onPrevPage}
      >
        <ChevronLeft size={14} aria-hidden />
      </IconButton>
      <PageIndicator aria-live="polite" aria-atomic="true">
        {currentPage} / {totalPages}
      </PageIndicator>
      <IconButton type="button" aria-label="Next page" disabled={nextDisabled} onClick={onNextPage}>
        <ChevronRight size={14} aria-hidden />
      </IconButton>
      {zoomGroup}
    </Root>
  );
});

PageToolbar.displayName = 'PageToolbar';
