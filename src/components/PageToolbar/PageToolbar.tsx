import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Target } from 'lucide-react';
import type { PageToolbarProps } from './PageToolbar.types';
import { Divider, IconButton, PageIndicator, Root } from './PageToolbar.styles';

export const PageToolbar = forwardRef<HTMLDivElement, PageToolbarProps>((props, ref) => {
  const { currentPage, totalPages, onPrevPage, onNextPage, onJumpToNextZone, jumpLabel, ...rest } =
    props;

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
    </Root>
  );
});

PageToolbar.displayName = 'PageToolbar';
