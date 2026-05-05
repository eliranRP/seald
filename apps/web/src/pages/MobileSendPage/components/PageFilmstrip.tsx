import styled from 'styled-components';
import type { MobilePlacedField } from '../types';
import { pagesWithFields } from '../model';

const Strip = styled.div`
  display: flex;
  gap: 6px;
  padding: 6px 12px 8px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  border-bottom: 0.5px solid var(--border-1);
  background: rgba(243, 246, 250, 0.85);
`;

const Thumb = styled.button<{ $active: boolean }>`
  flex-shrink: 0;
  width: 46px;
  height: 60px;
  padding: 4px 0 0;
  cursor: pointer;
  border: ${({ $active }) =>
    $active ? '2px solid var(--indigo-600)' : '1px solid var(--border-1)'};
  border-radius: 6px;
  background: #fff;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;

  &:focus-visible {
    outline: 2px solid var(--indigo-600);
    outline-offset: 2px;
  }
`;

const ThumbLine = styled.div<{ $w: number }>`
  width: ${({ $w }) => $w}px;
  height: 1.5px;
  background: var(--ink-150);
  border-radius: 1px;
`;

const Dot = styled.span`
  position: absolute;
  top: 3px;
  right: 3px;
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background: var(--success-500);
`;

const PageNum = styled.span<{ $active: boolean }>`
  position: absolute;
  bottom: 2px;
  left: 0;
  right: 0;
  text-align: center;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 9px;
  color: ${({ $active }) => ($active ? 'var(--indigo-700)' : 'var(--fg-3)')};
  font-weight: ${({ $active }) => ($active ? 700 : 500)};
`;

export interface PageFilmstripProps {
  readonly totalPages: number;
  readonly currentPage: number;
  readonly fields: ReadonlyArray<MobilePlacedField>;
  readonly onPage: (n: number) => void;
}

/**
 * Horizontal page-thumbnail strip. Tap a thumb to jump pages. The thumb
 * shows a green dot when the page has any linked field — useful when
 * scrolling through a long doc. The active page gets an indigo border.
 */
export function PageFilmstrip(props: PageFilmstripProps) {
  const { totalPages, currentPage, fields, onPage } = props;
  const withFields = pagesWithFields(fields);
  return (
    <Strip role="tablist" aria-label="Pages">
      {Array.from({ length: totalPages }, (_, i) => {
        const pageNumber = i + 1;
        const active = pageNumber === currentPage;
        const hasFields = withFields.has(pageNumber);
        return (
          <Thumb
            key={`page-thumb-${pageNumber}`}
            type="button"
            $active={active}
            role="tab"
            aria-selected={active}
            aria-label={hasFields ? `Page ${pageNumber}, has fields` : `Page ${pageNumber}`}
            onClick={() => onPage(pageNumber)}
          >
            <ThumbLine $w={32} aria-hidden />
            <ThumbLine $w={28} aria-hidden />
            <ThumbLine $w={30} aria-hidden />
            <ThumbLine $w={24} aria-hidden />
            {hasFields && <Dot aria-hidden />}
            <PageNum $active={active}>{pageNumber}</PageNum>
          </Thumb>
        );
      })}
    </Strip>
  );
}
