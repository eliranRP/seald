import { forwardRef, useEffect, useMemo, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { PageThumbRailProps } from './PageThumbRail.types';
import {
  FieldCountBadge,
  PageLabel,
  Rail,
  RailHeader,
  SkeletonLine,
  SkeletonLines,
  Thumb,
} from './PageThumbRail.styles';

function clampPage(next: number, total: number): number {
  if (next < 1) return 1;
  if (next > total) return total;
  return next;
}

/**
 * Deterministic pseudo-random line widths so each page's skeleton looks
 * distinct without actually rendering page content. Formula mirrors the
 * design reference (Screens.jsx) so thumbs fingerprint the same way in the
 * app as in the mock.
 */
function skeletonWidthPct(pageNum: number, lineIndex: number): number {
  return 65 + (((lineIndex + pageNum) * 11) % 30);
}

export const PageThumbRail = forwardRef<HTMLElement, PageThumbRailProps>((props, ref) => {
  const {
    totalPages,
    currentPage,
    onSelectPage,
    fieldCountByPage,
    label = 'Page navigation',
    ...rest
  } = props;

  const pages = useMemo<ReadonlyArray<number>>(
    () => Array.from({ length: totalPages }, (_v, i) => i + 1),
    [totalPages],
  );

  // Keep the active thumb visible when the rail overflows. jsdom doesn't
  // implement scrollIntoView, so feature-detect before calling.
  const activeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const el = activeRef.current;
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [currentPage]);

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>): void => {
    if (totalPages < 1) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      onSelectPage(clampPage(currentPage + 1, totalPages));
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
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
    <Rail {...rest} ref={ref} aria-label={label} onKeyDown={handleKeyDown}>
      <RailHeader aria-hidden>
        {currentPage}/{totalPages}
      </RailHeader>
      {pages.map((page) => {
        const count = fieldCountByPage?.[page] ?? 0;
        const isCurrent = page === currentPage;
        const isLast = page === totalPages;
        // Shorter skeleton on the final page (typically a signature page in
        // the mocks) to hint at reduced body copy.
        const lineCount = isLast ? 4 : 6;
        const countLabel = count > 0 ? `, ${String(count)} field${count === 1 ? '' : 's'}` : '';
        return (
          <Thumb
            key={page}
            ref={isCurrent ? activeRef : undefined}
            type="button"
            $active={isCurrent}
            aria-current={isCurrent ? 'page' : undefined}
            aria-label={`Page ${String(page)}${countLabel}`}
            title={`Page ${String(page)}`}
            onClick={handleThumbClick(page)}
          >
            <SkeletonLines aria-hidden>
              {Array.from({ length: lineCount }, (_v, i) => (
                // Decorative skeleton — index-based key is fine since nothing
                // about these lines has stable identity beyond position.
                // eslint-disable-next-line react/no-array-index-key
                <SkeletonLine key={i} $width={skeletonWidthPct(page, i)} />
              ))}
            </SkeletonLines>
            {count > 0 ? <FieldCountBadge aria-hidden>{count}</FieldCountBadge> : null}
            <PageLabel $active={isCurrent}>{page}</PageLabel>
          </Thumb>
        );
      })}
    </Rail>
  );
});

PageThumbRail.displayName = 'PageThumbRail';
