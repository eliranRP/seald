import styled from 'styled-components';

/**
 * Horizontally scrollable strip of page thumbnails. For short docs the thumbs
 * are centered; for long docs (e.g. 30+ pages) they overflow the viewport and
 * the user scrolls horizontally to reach the rest.
 *
 * The `margin: auto` on the first/last children is the classic "center when
 * fits, left-align when overflows" flex trick: `auto` expands to fill empty
 * space when content is narrower than the container, and collapses to 0 when
 * content is wider — so scrolling reveals the leading edge instead of
 * permanently clipping it.
 */
export const Nav = styled.nav`
  display: flex;
  gap: 6px;
  overflow-x: auto;
  margin-top: ${({ theme }) => theme.space[5]};
  max-width: 100%;

  /* Hide scrollbar but keep the element scrollable — the thumbs themselves
     act as affordances for position within the doc. */
  scrollbar-width: thin;

  & > *:first-child {
    margin-left: auto;
  }
  & > *:last-child {
    margin-right: auto;
  }
`;

export const Thumb = styled.button<{ readonly $active: boolean }>`
  width: 34px;
  height: 44px;
  flex-shrink: 0;
  border-radius: ${({ theme }) => theme.radius.xs};
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1.5px solid
    ${({ $active, theme }) => ($active ? theme.color.indigo[600] : theme.color.border[1])};
  display: flex;
  align-items: flex-end;
  justify-content: center;
  font-size: 10px;
  font-family: ${({ theme }) => theme.font.mono};
  color: ${({ $active, theme }) => ($active ? theme.color.indigo[700] : theme.color.fg[3])};
  padding: 0 0 3px;
  cursor: pointer;
  position: relative;
  appearance: none;
  line-height: 1;

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const FieldDot = styled.span`
  position: absolute;
  top: 3px;
  right: 3px;
  width: 6px;
  height: 6px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.indigo[600]};
`;
