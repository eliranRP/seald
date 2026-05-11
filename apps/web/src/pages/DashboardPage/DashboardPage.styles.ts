import styled from 'styled-components';
import { truncateText } from '@/styles/mixins';

/**
 * Mobile breakpoint for the dashboard chrome. Below this width we stack
 * the StatGrid into 2 columns (4×1fr at 375px gives ~70px tiles which
 * are unreadable), shrink the page padding, hide the column headings,
 * and switch the table from a 6-column grid into a stacked card list.
 *
 * BUG-1 regression: the previous fixed `1.3fr 1.5fr 1fr 180px 100px 60px`
 * grid plus `space[12]` (48px) left/right padding overflowed every
 * mobile viewport — the Status/Date/chevronron columns were clipped off
 * the right edge with no horizontal scroll affordance.
 */
const MOBILE = '768px';

export const Main = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
  padding: ${({ theme }) => theme.space[12]} ${({ theme }) => theme.space[12]}
    ${({ theme }) => theme.space[20]};

  @media (max-width: ${MOBILE}) {
    padding: ${({ theme }) => theme.space[6]} ${({ theme }) => theme.space[4]}
      ${({ theme }) => theme.space[12]};
  }
`;

export const Inner = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
`;

export const HeaderSlot = styled.div`
  margin-bottom: ${({ theme }) => theme.space[8]};
`;

export const StatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: ${({ theme }) => theme.space[4]};
  margin-bottom: ${({ theme }) => theme.space[6]};

  @media (max-width: ${MOBILE}) {
    grid-template-columns: repeat(2, 1fr);
    gap: ${({ theme }) => theme.space[3]};
  }
`;

export const TableShell = styled.div`
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-top: none;
  border-radius: ${({ theme }) => `0 0 ${theme.radius.xl} ${theme.radius.xl}`};
  overflow: hidden;
`;

/**
 * Default kit-spec column widths in pixels: Document · Signers ·
 * Progress · Status · Date · chevron. The chevron column stays
 * fixed (it's just an icon) so we resize the five content columns.
 *
 * Per-user overrides ride in `localStorage` via `useColumnWidths`;
 * the dashboard composes the active grid template from the live
 * width map and passes it down via the `$grid` prop.
 */
export const DEFAULT_COLUMN_WIDTHS = {
  document: 320,
  signers: 220,
  progress: 180,
  status: 180,
  date: 110,
} as const;

export const COLUMN_MIN_WIDTHS = {
  document: 200,
  signers: 140,
  progress: 120,
  status: 120,
  date: 90,
} as const;

export const CHEVRON_COL_PX = 60;

export const TableHead = styled.div<{ $grid: string }>`
  display: grid;
  grid-template-columns: ${({ $grid }) => $grid};
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[5]}`};
  background: ${({ theme }) => theme.color.ink[50]};
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
  font-size: 11px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.color.fg[3]};
  text-transform: uppercase;
  gap: ${({ theme }) => theme.space[4]};

  @media (max-width: ${MOBILE}) {
    /* Headings stop carrying meaning once the rows collapse into stacked
       cards — hide them rather than render a meaningless single-column
       label. The TableRow's badges/avatars/code are self-describing. */
    display: none;
  }
`;

export const HeadCell = styled.div`
  /* Each header cell hosts an absolutely-positioned ColumnResizeHandle
     pinned to its right edge — needs a positioning context. */
  position: relative;
  display: flex;
  align-items: center;
`;

/**
 * Clickable column label that toggles the server-side sort. Fills the
 * cell except for the 6px resize handle at the right edge, so a click
 * anywhere on the label sorts and a grab right at the border resizes.
 */
export const SortHeaderButton = styled.button<{ $active: boolean }>`
  all: unset;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  color: ${({ theme, $active }) => ($active ? theme.color.fg[1] : 'inherit')};
  padding: 2px 4px;
  margin-left: -4px;
  border-radius: ${({ theme }) => theme.radius.sm};
  &:hover {
    color: ${({ theme }) => theme.color.fg[1]};
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const SortCaret = styled.span`
  display: inline-flex;
  font-size: 10px;
  line-height: 1;
  color: ${({ theme }) => theme.color.indigo[600]};
`;

export const TableRow = styled.button<{ $grid: string }>`
  all: unset;
  box-sizing: border-box;
  display: grid;
  width: 100%;
  grid-template-columns: ${({ $grid }) => $grid};
  gap: ${({ theme }) => theme.space[4]};
  padding: ${({ theme }) => `${theme.space[4]} ${theme.space[5]}`};
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
  align-items: center;
  cursor: pointer;
  text-align: left;
  &:last-child {
    border-bottom: none;
  }
  &:hover {
    background: ${({ theme }) => theme.color.ink[50]};
  }
  &:focus-visible {
    box-shadow: ${({ theme }) => theme.shadow.focus};
    border-radius: ${({ theme }) => theme.radius.sm};
  }

  @media (max-width: ${MOBILE}) {
    /* Stack each row into a single column. The doc cell stays at the top
       (primary identity), the signer/progress/status badges flow below as
       inline-wrapping content, and the chevronron tucks into the top-right
       so the whole row still reads as a tap target. */
    grid-template-columns: 1fr auto;
    grid-template-areas:
      'doc chevron'
      'signers signers'
      'progress progress'
      'status date';
    gap: ${({ theme }) => theme.space[2]};
    padding: ${({ theme }) => `${theme.space[4]} ${theme.space[4]}`};
    align-items: start;

    & > :nth-child(1) {
      grid-area: doc;
    }
    & > :nth-child(2) {
      grid-area: signers;
    }
    & > :nth-child(3) {
      grid-area: progress;
    }
    & > :nth-child(4) {
      grid-area: status;
    }
    & > :nth-child(5) {
      grid-area: date;
      justify-self: end;
    }
    & > :nth-child(6) {
      grid-area: chevron;
      align-self: center;
    }
  }
`;

export const DocCell = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[3]};
  align-items: center;
  min-width: 0;
`;

export const DocTitle = styled.div`
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  font-size: 14px;
  ${truncateText}
`;

export const DocCode = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  font-family: ${({ theme }) => theme.font.mono};
`;

export const SignersCell = styled.div`
  display: flex;
  align-items: center;
  min-width: 0;
`;

export const ProgressCell = styled.div`
  display: flex;
  align-items: center;
  min-width: 0;
`;

export const DateCell = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.color.fg[3]};
  font-family: ${({ theme }) => theme.font.mono};
`;

export const ChevronCell = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  color: ${({ theme }) => theme.color.fg[3]};
`;
