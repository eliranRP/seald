import styled, { css, keyframes, type DefaultTheme } from 'styled-components';
import { truncateText, visuallyHidden } from '@/styles/mixins';
import type { StatusTone } from './rowModel';

/** Phones: the design's mobile layout (HomeMobile) takes over. */
export const MOBILE = '640px';

/* No scroll box of its own: the shell's content area scrolls, so the legal
   footer follows the list instead of sitting over it. */
export const Main = styled.div`
  flex: 1 0 auto;
  min-width: 0;
  padding: ${({ theme }) => theme.space[8]} ${({ theme }) => theme.space[12]}
    ${({ theme }) => theme.space[16]};

  @media (max-width: ${MOBILE}) {
    padding: ${({ theme }) => theme.space[4]} ${({ theme }) => theme.space[4]}
      ${({ theme }) => theme.space[24]};
  }
`;

export const Inner = styled.div`
  max-width: 1184px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[6]};

  @media (max-width: ${MOBILE}) {
    gap: ${({ theme }) => theme.space[4]};
  }
`;

export const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
`;

export const PageTitle = styled.h1`
  margin: 0;
  flex: 1 1 auto;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.x4l};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  line-height: ${({ theme }) => theme.font.lineHeight.tight};
  letter-spacing: ${({ theme }) => theme.font.tracking.tight};
  color: ${({ theme }) => theme.color.fg[1]};

  @media (max-width: ${MOBILE}) {
    font-size: ${({ theme }) => theme.font.size.x3l};
  }
`;

/**
 * Phones: the search button beside the title. Negative margins keep the
 * 44px touch target from making the title row taller than the title.
 */
export const HeaderSearch = styled.span`
  display: inline-flex;
  margin: -6px -10px -6px 0;
`;

/** Split primary button: main action + chevron that opens the New menu. */
export const SplitGroup = styled.div`
  display: inline-flex;

  @media (max-width: ${MOBILE}) {
    display: none;
  }

  & > button:first-child {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
  & > button:last-child {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    border-left: 1px solid ${({ theme }) => theme.color.indigo[400]};
  }
`;

export const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]};
  min-width: 0;

  @media (max-width: ${MOBILE}) {
    gap: ${({ theme }) => theme.space[2]};
  }
`;

export const SectionHead = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
`;

export const Eyebrow = styled.h2`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.xs};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: ${({ theme }) => theme.font.tracking.wider};
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.fg[3]};
`;

/** A tab's count: plain muted digits beside the label. */
export const TabCount = styled.span`
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.regular};
  color: ${({ theme }) => theme.color.fg[3]};
  font-variant-numeric: tabular-nums;
`;

export const CountPill = styled.span<{ $accent?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: ${({ theme }) => theme.radius.pill};
  font-size: ${({ theme }) => theme.font.size.xs};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  line-height: 1;
  font-variant-numeric: tabular-nums;
  background: ${({ theme, $accent }) => ($accent ? theme.color.indigo[50] : theme.color.ink[100])};
  color: ${({ theme, $accent }) => ($accent ? theme.color.indigo[800] : theme.color.ink[600])};
`;

export const MoreLink = styled.button`
  border: 0;
  background: none;
  padding: 0;
  cursor: pointer;
  font: inherit;
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.indigo[600]};
`;

export const NeedsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: ${({ theme }) => theme.space[3]};
  list-style: none;
  margin: 0;
  padding: 0;

  @media (max-width: ${MOBILE}) {
    display: flex;
    overflow-x: auto;
    margin: 0 -${({ theme }) => theme.space[4]};
    padding: 0 ${({ theme }) => theme.space[4]};
    scroll-snap-type: x proximity;
  }
`;

export const NeedCard = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  min-width: 0;
  padding: 12px 12px 12px 14px;
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};

  @media (max-width: ${MOBILE}) {
    flex: 0 0 248px;
    width: 248px;
    gap: 10px;
    padding: 10px 10px 10px 12px;
    scroll-snap-align: start;

    /* The icon-only action is a 36px square on the phone card. */
    & > button:last-child {
      width: 36px;
      height: 36px;
      min-height: 36px;
      border-radius: ${({ theme }) => theme.radius.md};
    }
  }
`;

export type NeedTone = 'indigo' | 'amber' | 'red';

/**
 * Neutral on purpose: the card's one colored element is its action button,
 * so "what do I do" reads before "what kind of item is this".
 */
export const NeedIcon = styled.span<{ $tone: NeedTone }>`
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.ink[100]};
  color: ${({ theme, $tone }) =>
    $tone === 'red' ? theme.color.danger[700] : theme.color.ink[600]};
`;

export const NeedBody = styled.div`
  flex: 1 1 auto;
  min-width: 0;
`;

export const NeedTitle = styled.button`
  display: block;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  text-align: left;
  font: inherit;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  ${truncateText}

  &:hover {
    color: ${({ theme }) => theme.color.indigo[700]};
  }
`;

export const MetaLine = styled.div`
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.fg[3]};
  ${truncateText}
`;

export const FixField = styled.input`
  width: 100%;
  height: 32px;
  margin-top: 4px;
  box-sizing: border-box;
  padding: 0 10px;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.bg.surface};
  color: ${({ theme }) => theme.color.fg[1]};
  font: inherit;
  font-size: ${({ theme }) => theme.font.size.caption};

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.color.border.focus};
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const TabsRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};

  @media (max-width: ${MOBILE}) {
    border-bottom: 0;
  }
`;

export const TabList = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  gap: ${({ theme }) => theme.space[1]};
  overflow-x: auto;

  @media (max-width: ${MOBILE}) {
    gap: ${({ theme }) => theme.space[2]};
    margin: 0 -${({ theme }) => theme.space[4]};
    padding: 0 ${({ theme }) => theme.space[4]};
  }
`;

export const Tab = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  flex: none;
  height: 44px;
  padding: 0 ${({ theme }) => theme.space[3]};
  border: 0;
  border-bottom: 2px solid
    ${({ theme, $active }) => ($active ? theme.color.indigo[600] : 'transparent')};
  margin-bottom: -1px;
  background: none;
  cursor: pointer;
  font: inherit;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme, $active }) =>
    $active ? theme.font.weight.semibold : theme.font.weight.medium};
  color: ${({ theme, $active }) => ($active ? theme.color.fg[1] : theme.color.fg[3])};
  transition: color ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeOut};

  &:hover {
    color: ${({ theme }) => theme.color.fg[1]};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: -2px;
    border-radius: ${({ theme }) => theme.radius.xs};
  }

  /* Phones: the design's status pills (canvas \`.pill\`, 44px touch height). */
  @media (max-width: ${MOBILE}) {
    gap: 6px;
    border: 1px solid ${({ theme }) => theme.color.border[1]};
    border-radius: ${({ theme }) => theme.radius.pill};
    margin-bottom: 0;
    font-size: ${({ theme }) => theme.font.size.caption};
    font-weight: ${({ theme }) => theme.font.weight.medium};
    background: ${({ theme, $active }) => ($active ? theme.color.ink[900] : theme.color.paper)};
    border-color: ${({ theme, $active }) =>
      $active ? theme.color.ink[900] : theme.color.border[1]};
    color: ${({ theme, $active }) => ($active ? theme.color.paper : theme.color.fg[2])};

    &:hover {
      color: ${({ theme, $active }) => ($active ? theme.color.paper : theme.color.fg[1])};
    }
  }
`;

export const ToolbarRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
`;

export const SearchField = styled.label`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  width: 320px;
  max-width: 100%;
  height: 40px;
  padding: 0 ${({ theme }) => theme.space[3]};
  box-sizing: border-box;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.bg.surface};
  color: ${({ theme }) => theme.color.fg[3]};

  &:focus-within {
    border-color: ${({ theme }) => theme.color.border.focus};
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }

  input {
    flex: 1 1 auto;
    min-width: 0;
    border: 0;
    outline: 0;
    background: none;
    font: inherit;
    font-size: ${({ theme }) => theme.font.size.bodySm};
    color: ${({ theme }) => theme.color.fg[1]};
  }

  @media (max-width: ${MOBILE}) {
    flex: 1 1 100%;
    width: auto;
    height: 44px;

    input {
      font-size: ${({ theme }) => theme.font.size.body};
    }
  }
`;

export const Kbd = styled.kbd`
  padding: 1px 6px;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.xxs};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.micro};
  color: ${({ theme }) => theme.color.fg[3]};

  @media (max-width: ${MOBILE}) {
    display: none;
  }
`;

export const Spacer = styled.span`
  flex: 1 1 auto;
`;

/** A button that opens a menu and shows the picked value (`is-set`). */
export const SelectButton = styled.button<{ $set?: boolean; $tall?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  height: ${({ $tall }) => ($tall ? '44px' : '40px')};
  padding: 0 ${({ theme }) => theme.space[3]};
  border: 1px solid ${({ theme, $set }) => ($set ? theme.color.indigo[200] : theme.color.border[1])};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme, $set }) => ($set ? theme.color.indigo[50] : theme.color.paper)};
  color: ${({ theme, $set }) => ($set ? theme.color.indigo[800] : theme.color.fg[1])};
  font: inherit;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  cursor: pointer;

  &:hover {
    background: ${({ theme, $set }) => ($set ? theme.color.indigo[100] : theme.color.bg.subtle)};
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const ChipsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
`;

export const Chip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 6px 0 12px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.indigo[50]};
  color: ${({ theme }) => theme.color.indigo[800]};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.medium};

  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 0;
    border-radius: ${({ theme }) => theme.radius.pill};
    background: none;
    color: inherit;
    cursor: pointer;
  }
  button:hover {
    background: ${({ theme }) => theme.color.indigo[100]};
  }
`;

export const BulkBar = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  min-height: 44px;
  padding: 4px ${({ theme }) => theme.space[3]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.ink[900]};
  color: ${({ theme }) => theme.color.fgOnAccent};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};

  button {
    color: inherit;
  }
`;

export const TableShell = styled.div`
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  overflow: hidden;

  /* Once anything is selected, every row shows its checkbox. */
  &:has(input[type='checkbox']:checked) [data-testid='doc-row'] > input[type='checkbox'] {
    opacity: 1;
  }

  @media (max-width: ${MOBILE}) {
    background: none;
    border: 0;
    border-radius: 0;
    overflow: visible;
  }
`;

/** Canvas `.thead` / `.trow` columns: check, document, status, signers, updated, actions. */
const ROW_GRID = css`
  display: grid;
  grid-template-columns: 28px minmax(0, 2.4fr) minmax(0, 1.7fr) minmax(0, 1.2fr) 88px 172px;
  align-items: center;
  column-gap: ${({ theme }) => theme.space[4]};
  padding: 0 ${({ theme }) => theme.space[5]};
`;

export const THead = styled.div`
  ${ROW_GRID}
  height: 44px;
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
  font-size: ${({ theme }) => theme.font.size.xs};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const GroupLabel = styled.h3`
  margin: 0;
  padding: ${({ theme }) => theme.space[3]} ${({ theme }) => theme.space[5]} 6px;
  font-size: ${({ theme }) => theme.font.size.xs};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  line-height: 1.5;
  letter-spacing: ${({ theme }) => theme.font.tracking.wider};
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.fg[3]};
  border-bottom: 1px solid ${({ theme }) => theme.color.ink[150]};

  @media (max-width: ${MOBILE}) {
    padding: 0;
    background: none;
    border-bottom: 0;
  }
`;

export const MobileGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
  margin-bottom: ${({ theme }) => theme.space[4]};
`;

const newFade = keyframes`
  from { background-color: var(--indigo-50); }
  to { background-color: transparent; }
`;

export const TRow = styled.div<{ $selected?: boolean; $hot?: boolean; $fresh?: boolean }>`
  ${ROW_GRID}
  position: relative;
  min-height: 64px;
  padding-top: 10px;
  padding-bottom: 10px;
  box-sizing: border-box;
  border-bottom: 1px solid ${({ theme }) => theme.color.ink[150]};
  background: ${({ theme, $selected }) => ($selected ? theme.color.indigo[50] : 'transparent')};
  ${({ theme, $hot, $selected }) =>
    $hot && !$selected ? `background: ${theme.color.ink[50]};` : ''}
  transition: background ${({ theme }) => theme.motion.durFast};

  ${({ $fresh }) =>
    $fresh
      ? css`
          background-color: ${({ theme }) => theme.color.indigo[50]};
          animation: ${newFade} 3s ${({ theme }) => theme.motion.easeOut} 1s forwards;
          @media (prefers-reduced-motion: reduce) {
            animation: none;
          }
        `
      : ''}

  &:hover {
    background: ${({ theme, $selected }) =>
      $selected ? theme.color.indigo[50] : theme.color.ink[50]};
  }

  /* The row's actions rest hidden and show on hover, focus, or while its menu is open. */
  & > [data-part='row-actions'] {
    opacity: ${({ $hot }) => ($hot ? 1 : 0)};
    transition: opacity ${({ theme }) => theme.motion.durFast}
      ${({ theme }) => theme.motion.easeStandard};
  }
  &:hover > [data-part='row-actions'],
  &:focus-within > [data-part='row-actions'] {
    opacity: 1;
  }

  /* Checkboxes too: they rest hidden until hover or focus, and all show once
     anything is selected (the TableShell rule below). */
  & > input[type='checkbox'] {
    opacity: 0;
    transition: opacity ${({ theme }) => theme.motion.durFast}
      ${({ theme }) => theme.motion.easeStandard};
  }
  &:hover > input[type='checkbox'],
  & > input[type='checkbox']:focus-visible,
  & > input[type='checkbox']:checked {
    opacity: 1;
  }

  @media (hover: none) {
    & > [data-part='row-actions'],
    & > input[type='checkbox'] {
      opacity: 1;
    }
  }
`;

export const MCard = styled.div<{ $selected?: boolean; $fresh?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  min-height: 64px;
  box-sizing: border-box;
  padding: ${({ theme }) => theme.space[3]};
  background: ${({ theme, $selected }) =>
    $selected ? theme.color.indigo[50] : theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};

  ${({ $fresh }) =>
    $fresh
      ? css`
          background-color: ${({ theme }) => theme.color.indigo[50]};
          animation: ${newFade} 3s ${({ theme }) => theme.motion.easeOut} 1s forwards;
          @media (prefers-reduced-motion: reduce) {
            animation: none;
          }
        `
      : ''}
`;

export const RowCheck = styled.input`
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: ${({ theme }) => theme.color.indigo[600]};
  cursor: pointer;
`;

export const DocCell = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  min-width: 0;
`;

export const DocText = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1 1 auto;
`;

export const DocTitleButton = styled.button`
  display: block;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  text-align: left;
  font: inherit;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  ${truncateText}

  &:hover {
    color: ${({ theme }) => theme.color.indigo[700]};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 2px;
    border-radius: ${({ theme }) => theme.radius.xxs};
  }
`;

export const DocSub = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  margin-top: 2px;
`;

export const Tag = styled.span`
  display: inline-flex;
  align-items: center;
  flex: none;
  height: 20px;
  padding: 0 ${({ theme }) => theme.space[2]};
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.ink[150]};
  font-size: ${({ theme }) => theme.font.size.micro};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  line-height: 1;
  color: ${({ theme }) => theme.color.ink[600]};
`;

/** Badge and its reason sit on one line, wrapping only when the column is too narrow. */
export const StatusCell = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  min-width: 0;
`;

function dotColor(theme: DefaultTheme, tone: StatusTone): string {
  switch (tone) {
    case 'accent':
      return theme.color.indigo[600];
    case 'success':
      return theme.color.success[500];
    case 'danger':
      return theme.color.danger[500];
    case 'neutral':
      return theme.color.ink[300];
  }
}

/**
 * The row's status: a small dot (the only color in the row) and one plain
 * sentence such as "Waiting for Bob".
 */
export const StatusText = styled.span<{ $tone: StatusTone; $strong?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  min-width: 0;
  max-width: 100%;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme, $strong }) =>
    $strong ? theme.font.weight.semibold : theme.font.weight.regular};
  color: ${({ theme, $strong }) => ($strong ? theme.color.fg[1] : theme.color.fg[2])};
  ${truncateText}

  &::before {
    content: '';
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${({ theme, $tone }) => dotColor(theme, $tone)};
  }

  @media (max-width: ${MOBILE}) {
    font-size: ${({ theme }) => theme.font.size.caption};
  }
`;

/** Muted "1 of 2 signed". */
export const SignedText = styled.span`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
  font-variant-numeric: tabular-nums;
`;

export const SignersCell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
`;

export const UpdatedCell = styled.span`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
  font-variant-numeric: tabular-nums;
`;

export const RowActions = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.space[1]};
  position: relative;
`;

/** Mobile: the result count at the end of the Filter / Recent / Select row. */
export const ResultCount = styled.span`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
  font-variant-numeric: tabular-nums;
`;

export const SrOnly = styled.span`
  ${visuallyHidden}
`;

export const Footer = styled.div`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const SkeletonRow = styled.div`
  ${ROW_GRID}
  min-height: 64px;
  border-bottom: 1px solid ${({ theme }) => theme.color.ink[150]};

  @media (max-width: ${MOBILE}) {
    display: flex;
    gap: ${({ theme }) => theme.space[3]};
    padding: ${({ theme }) => theme.space[3]};
    border: 1px solid ${({ theme }) => theme.color.border[1]};
    border-radius: ${({ theme }) => theme.radius.lg};
    margin-bottom: ${({ theme }) => theme.space[2]};
  }
`;

export const SkeletonStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  flex: 1 1 auto;
`;

export const FirstRunBlock = styled.section`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[6]};
  padding: ${({ theme }) => theme.space[4]} 0 ${({ theme }) => theme.space[8]};
  text-align: center;
`;

export const FirstRunTitle = styled.h2`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h3};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};

  @media (max-width: ${MOBILE}) {
    font-size: ${({ theme }) => theme.font.size.x2l};
  }
`;

export const Steps = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
`;

export const Step = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[2]};

  & > span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: ${({ theme }) => theme.radius.pill};
    background: ${({ theme }) => theme.color.indigo[50]};
    color: ${({ theme }) => theme.color.indigo[700]};
  }
`;

export const StepLine = styled.span`
  width: 40px;
  height: 2px;
  margin-bottom: 24px;
  background: ${({ theme }) => theme.color.border[1]};
`;

export const Dropzone = styled.div<{ $over?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  width: 100%;
  max-width: 640px;
  box-sizing: border-box;
  padding: ${({ theme }) => theme.space[8]} ${({ theme }) => theme.space[4]};
  border: 2px dashed
    ${({ theme, $over }) => ($over ? theme.color.indigo[500] : theme.color.border[1])};
  border-radius: ${({ theme }) => theme.radius.xl};
  background: ${({ theme, $over }) => ($over ? theme.color.indigo[50] : theme.color.bg.surface)};
  color: ${({ theme }) => theme.color.indigo[600]};
`;

export const DropTitle = styled.div`
  font-size: ${({ theme }) => theme.font.size.xl};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const DropMeta = styled.span`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const ButtonRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: ${({ theme }) => theme.space[2]};
`;

export const SheetTitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  padding: 4px 4px 12px;
`;

export const SheetSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
  margin-bottom: ${({ theme }) => theme.space[4]};
`;

export const PillGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: ${({ theme }) => theme.space[2]};
`;

export const PillRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[2]};
`;

export const SheetItem = styled.button<{ $danger?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  width: 100%;
  height: 48px;
  padding: 0 ${({ theme }) => theme.space[2]};
  border: 0;
  background: none;
  cursor: pointer;
  font: inherit;
  font-size: ${({ theme }) => theme.font.size.body};
  color: ${({ theme, $danger }) => ($danger ? theme.color.danger[700] : theme.color.fg[1])};
  text-align: left;

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

export const MobileActionBar = styled.div`
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  background: ${({ theme }) => theme.color.bg.surface};
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  padding-bottom: env(safe-area-inset-bottom);

  button {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-height: 56px;
    border: 0;
    background: none;
    cursor: pointer;
    font: inherit;
    font-size: ${({ theme }) => theme.font.size.micro};
    font-weight: ${({ theme }) => theme.font.weight.medium};
    color: ${({ theme }) => theme.color.fg[2]};
  }
  button[data-danger='true'] {
    color: ${({ theme }) => theme.color.danger[700]};
  }
`;

export const FieldLabel = styled.label`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[2]};
`;
