import { forwardRef, useMemo } from 'react';
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

  const fieldPageSet = useMemo<ReadonlySet<number>>(
    () => new Set(pagesWithFields ?? []),
    [pagesWithFields],
  );

  const pages = useMemo<ReadonlyArray<number>>(
    () => Array.from({ length: totalPages }, (_, i) => i + 1),
    [totalPages],
  );

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
