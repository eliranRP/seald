import { forwardRef, useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { PageThumbStripProps } from './PageThumbStrip.types';
import { FieldDot, Nav, Thumb } from './PageThumbStrip.styles';

function clampPage(next: number, total: number): number {
  if (next < 1) {
    return 1;
  }
  if (next > total) {
    return total;
  }
  return next;
}

export const PageThumbStrip = forwardRef<HTMLElement, PageThumbStripProps>((props, ref) => {
  const {
    totalPages,
    currentPage,
    onSelectPage,
    pagesWithFields,
    label = 'Page navigation',
    ...rest
  } = props;

  // Per skill rule 2.4 (no unjustified memoization): both `fieldPageSet` and
  // `pages` are O(N) on a small N (totalPages, typically <50) and not passed
  // to memoized children, so we let React rebuild them on each render rather
  // than carry the dependency-tracking overhead.
  const fieldPageSet: ReadonlySet<number> = new Set(pagesWithFields ?? []);
  const pages: ReadonlyArray<number> = Array.from({ length: totalPages }, (_, i) => i + 1);

  // Keep the active thumb in view when the strip overflows (long docs). Without
  // this, a user on page 25 of 30 wouldn't see which thumb is selected because
  // it'd be clipped past the right edge of the strip. `scrollIntoView` is not
  // implemented in jsdom, so we feature-detect before calling.
  const activeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const el = activeRef.current;
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [currentPage]);

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>): void => {
    if (totalPages < 1) {
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      onSelectPage(clampPage(currentPage + 1, totalPages));
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onSelectPage(clampPage(currentPage - 1, totalPages));
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      onSelectPage(1);
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      onSelectPage(totalPages);
    }
  };

  const handleThumbClick = (page: number) => (): void => {
    onSelectPage(page);
  };

  return (
    <Nav {...rest} ref={ref} aria-label={label} onKeyDown={handleKeyDown}>
      {pages.map((page) => {
        const hasFields = fieldPageSet.has(page);
        const isCurrent = page === currentPage;
        const suffix = hasFields ? ', has fields' : '';
        return (
          <Thumb
            key={page}
            ref={isCurrent ? activeRef : undefined}
            type="button"
            $active={isCurrent}
            aria-current={isCurrent ? 'page' : undefined}
            aria-label={`Page ${page}${suffix}`}
            onClick={handleThumbClick(page)}
          >
            {page}
            {hasFields ? <FieldDot aria-hidden /> : null}
          </Thumb>
        );
      })}
    </Nav>
  );
});

PageThumbStrip.displayName = 'PageThumbStrip';
