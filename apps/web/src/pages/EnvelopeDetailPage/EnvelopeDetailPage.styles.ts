import styled, { css } from 'styled-components';
import { InfoChip } from '@/components/InfoChip';
import { MenuAnchor } from '@/components/Menu';
import { truncateText } from '@/styles/mixins';

const MOBILE = '@media (max-width: 640px)';

export const Wrap = styled.div`
  min-height: 100%;
  background: ${({ theme }) => theme.color.bg.app};
  font-family: ${({ theme }) => theme.font.sans};
`;

export const Inner = styled.div`
  max-width: 960px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[5]};
  padding: ${({ theme }) => `${theme.space[8]} ${theme.space[12]} ${theme.space[16]}`};
  ${MOBILE} {
    /* Room for the sticky action bar (12 + 44 + 24) under the last section. */
    padding: ${({ theme }) => `${theme.space[4]} ${theme.space[4]} 96px`};
    gap: ${({ theme }) => theme.space[4]};
  }
`;

export const BackRow = styled.div`
  display: flex;
  ${MOBILE} {
    display: none;
  }
`;

/** Actions on the load-error card: Try again first, then the way out. Wraps on a phone. */
export const ErrorActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[3]};
`;

/** Mobile header: back, the envelope title and the more menu (`.m-top`). */
export const MobileTop = styled.div`
  display: none;
  ${MOBILE} {
    position: sticky;
    top: 0;
    z-index: ${({ theme }) => theme.z.sticky};
    display: flex;
    align-items: center;
    height: 56px;
    padding: ${({ theme }) => `0 ${theme.space[2]} 0 ${theme.space[4]}`};
    background: ${({ theme }) => theme.color.paper};
    border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
  }
`;

export const MobileTopTitle = styled.span`
  ${truncateText}
  flex: 1;
  min-width: 0;
  font-size: ${({ theme }) => theme.font.size.body};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

/** Hidden at phone width (the mobile board leaves it out). */
export const DesktopOnly = styled.span`
  ${MOBILE} {
    display: none;
  }
`;

export const HeadRow = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space[4]};
  ${MOBILE} {
    flex-direction: column;
  }
`;

export const HeadText = styled.div`
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  ${MOBILE} {
    gap: ${({ theme }) => theme.space[2]};
  }
`;

export const Title = styled.h1`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.x4l};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  letter-spacing: ${({ theme }) => theme.font.tracking.tight};
  color: ${({ theme }) => theme.color.fg[1]};
  line-height: ${({ theme }) => theme.font.lineHeight.tight};
  overflow-wrap: anywhere;
  ${MOBILE} {
    font-size: ${({ theme }) => theme.font.size.x2l};
  }
`;

export const HeadMeta = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[2]};
  align-items: center;
  flex-wrap: wrap;
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

/** Tag chips + add button; a full line of the meta block when tags exist. */
export const HeadTags = styled.div<{ readonly $ownRow: boolean }>`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  min-width: 0;
  ${({ $ownRow }) =>
    $ownRow &&
    css`
      flex-basis: 100%;
    `}
`;

export const HeadCode = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.xs};
`;

export const HeadActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  flex: none;
  max-width: 460px;
  ${MOBILE} {
    display: none;
  }
`;

export const Hint = styled.span`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Anchor = styled.div`
  position: relative;
  display: inline-flex;
`;

/** Full width in the mobile action bar: the main half grows, the chevron stays 44px. */
export const DownloadAnchor = styled(MenuAnchor)<{ readonly $full: boolean }>`
  ${({ $full }) =>
    $full &&
    css`
      flex: 1;
    `}
`;

export const Split = styled.div<{ readonly $full?: boolean }>`
  display: inline-flex;
  ${({ $full }) =>
    $full === true &&
    css`
      width: 100%;
      & > button:first-child {
        flex: 1;
      }
    `}
  & > button:first-child {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
  /* Canvas .btn-split: a faint divider that reads on the primary fill too. */
  & > button:last-child {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    border-left-color: rgba(255, 255, 255, 0.25);
  }
`;

export const Card = styled.section<{ readonly $flush?: boolean }>`
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  padding: ${({ theme, $flush }) => ($flush === true ? '0' : theme.space[5])};
`;

export const SummaryCard = styled(Card)`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};
  min-height: 72px;
  padding-top: 0;
  padding-bottom: 0;
  ${MOBILE} {
    /* Stacked: the count, then the bar, then the chips. */
    flex-direction: column;
    align-items: stretch;
    gap: ${({ theme }) => theme.space[3]};
    padding: ${({ theme }) => theme.space[4]};
  }
`;

export const SummaryNum = styled.span`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.x3l};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const SummaryLead = styled.div`
  display: flex;
  align-items: baseline;
  gap: 10px;
  ${MOBILE} {
    gap: ${({ theme }) => theme.space[2]};
  }
  flex: none;
`;

export const SummaryOk = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
  font-size: ${({ theme }) => theme.font.size.bodyMd};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  svg {
    color: ${({ theme }) => theme.color.success[500]};
  }
`;

export const ChipsRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  flex-wrap: wrap;
  ${MOBILE} {
    width: 100%;
  }
`;

export const ChipLink = styled.a`
  text-decoration: none;
`;

export const Bar = styled.div`
  flex: 1;
  min-width: 120px;
  height: 6px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.ink[100]};
  overflow: hidden;
  ${MOBILE} {
    flex: none;
    min-width: 0;
  }
`;

export const BarFill = styled.div<{
  readonly $pct: number;
  readonly $tone: 'ok' | 'muted' | 'base';
}>`
  height: 100%;
  width: ${({ $pct }) => `${$pct}%`};
  border-radius: inherit;
  background: ${({ theme, $tone }) =>
    ({ ok: theme.color.success[500], muted: theme.color.ink[400], base: theme.color.indigo[600] })[
      $tone
    ]};
  transition: width ${({ theme }) => theme.motion.durEnter} ${({ theme }) => theme.motion.easeOut};
`;

/**
 * A card on desktop. On mobile the board drops the frame and lets the
 * section (signers, activity) sit on the page background.
 */
export const SectionCard = styled(Card)`
  ${MOBILE} {
    padding: 0;
    background: transparent;
    border: 0;
    border-radius: 0;
  }
`;

export const CardHead = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  padding: ${({ theme }) => `${theme.space[4]} ${theme.space[5]} ${theme.space[3]}`};
  ${MOBILE} {
    padding: ${({ theme }) => `0 0 ${theme.space[2]}`};
  }
`;

export const ActivityHead = styled(CardHead)`
  padding: ${({ theme }) => `0 0 ${theme.space[3]}`};
  ${MOBILE} {
    padding-bottom: ${({ theme }) => theme.space[2]};
  }
`;

export const Eyebrow = styled.span`
  font-size: ${({ theme }) => theme.font.size.xs};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: ${({ theme }) => theme.font.tracking.wider};
  color: ${({ theme }) => theme.color.fg[3]};
  text-transform: uppercase;
`;

/** Pill counter next to an eyebrow (`.count`). */
export const Count = styled.span`
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
  background: ${({ theme }) => theme.color.ink[100]};
  color: ${({ theme }) => theme.color.ink[600]};
`;

export const EmptyNote = styled.p`
  margin: 0;
  padding: ${({ theme }) => `0 ${theme.space[5]} ${theme.space[4]}`};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
  ${MOBILE} {
    padding: 0;
  }
`;

export const Spacer = styled.span`
  flex: 1;
`;

export const SignerList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  ${MOBILE} {
    display: flex;
    flex-direction: column;
    gap: ${({ theme }) => theme.space[2]};
  }
`;

/** Desktop: a divided row (`.sgn-row`). Mobile: its own small card. */
export const SignerItem = styled.li<{ readonly $bad: boolean }>`
  & + & {
    border-top: 1px solid ${({ theme }) => theme.color.ink[150]};
  }
  ${({ $bad, theme }) =>
    $bad &&
    css`
      background: ${theme.color.danger[50]};
    `}
  ${MOBILE} {
    background: ${({ theme, $bad }) => ($bad ? theme.color.danger[50] : theme.color.bg.surface)};
    border: 1px solid
      ${({ theme, $bad }) => ($bad ? theme.color.danger[500] : theme.color.border[1])};
    border-radius: ${({ theme }) => theme.radius.lg};
    & + & {
      border-top: 1px solid
        ${({ theme, $bad }) => ($bad ? theme.color.danger[500] : theme.color.border[1])};
    }
  }
`;

export const SignerGrid = styled.div`
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) 132px 96px 120px;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};
  min-height: 64px;
  padding: ${({ theme }) => `10px ${theme.space[5]}`};
  ${MOBILE} {
    display: flex;
    gap: 10px;
    padding: ${({ theme }) => theme.space[3]};
  }
`;

export const SignerWho = styled.div`
  min-width: 0;
  ${MOBILE} {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: ${({ theme }) => theme.space[1]};
  }
`;

export const SignerName = styled.div`
  ${truncateText}
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const SignerEmail = styled.div`
  ${truncateText}
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const TrackSlot = styled.div`
  display: flex;
`;

export const When = styled.span<{ readonly $bad: boolean }>`
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme, $bad }) => ($bad ? theme.font.weight.semibold : 'inherit')};
  color: ${({ theme, $bad }) => ($bad ? theme.color.danger[700] : theme.color.fg[3])};
  white-space: nowrap;
`;

export const RowActions = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.space[1]};
  /* Remind + more (131px) may spill past the 120px track to the right, as on the board. */
  min-width: max-content;
  ${MOBILE} {
    flex: none;
    &:empty {
      display: none;
    }
  }
`;

export const FixRow = styled.form`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[5]} ${theme.space[4]} 68px`};
  border-top: 1px solid ${({ theme }) => theme.color.ink[150]};
  ${MOBILE} {
    padding: ${({ theme }) => `${theme.space[2]} ${theme.space[3]} ${theme.space[3]}`};
  }
`;

export const FieldBox = styled.label`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  flex: 1;
  min-width: 220px;
  max-width: 420px;
  height: 40px;
  padding: 0 ${({ theme }) => theme.space[3]};
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.color.fg[3]};
  &:focus-within {
    border-color: ${({ theme }) => theme.color.indigo[500]};
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
  input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    font: inherit;
    font-size: ${({ theme }) => theme.font.size.bodySm};
    color: ${({ theme }) => theme.color.fg[1]};
    /* 16px on a phone so iOS does not zoom into the field on focus. */
    ${MOBILE} {
      font-size: ${({ theme }) => theme.font.size.body};
    }
  }
  &:has(input[aria-invalid='true']) {
    border-color: ${({ theme }) => theme.color.danger[500]};
  }
`;

/** Inline field error under the email fix / replace inputs: what is wrong and how to fix it. */
export const FieldHint = styled.p`
  flex-basis: 100%;
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.danger[700]};
`;

export const ActList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

/** Compact timeline row (`.act-row`): a rail joins the icons top to bottom. */
export const ActRow = styled.li`
  position: relative;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  min-height: 44px;
  &::before {
    content: '';
    position: absolute;
    left: 13px;
    top: 0;
    bottom: 0;
    width: 2px;
    background: ${({ theme }) => theme.color.ink[150]};
  }
  &:first-child::before {
    top: 50%;
  }
  &:last-child::before {
    bottom: 50%;
  }
  &:only-child::before {
    display: none;
  }
`;

export const ActIcon = styled.span<{ readonly $tone: 'neutral' | 'ok' | 'bad' }>`
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme, $tone }) =>
    ({ ok: theme.color.success[50], bad: theme.color.danger[50], neutral: theme.color.bg.subtle })[
      $tone
    ]};
  color: ${({ theme, $tone }) =>
    ({ ok: theme.color.success[700], bad: theme.color.danger[700], neutral: theme.color.fg[2] })[
      $tone
    ]};
`;

export const ActText = styled.span`
  ${truncateText}
  min-width: 0;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const ActTime = styled.span`
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.fg[3]};
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
`;

export const ActFoot = styled.div`
  margin-top: ${({ theme }) => theme.space[2]};
  ${MOBILE} {
    display: flex;
    justify-content: center;
  }
`;

export const ChainChip = styled(InfoChip)<{ readonly $ok: boolean }>`
  color: ${({ theme, $ok }) => ($ok ? theme.color.success[700] : theme.color.danger[700])};
`;

export const MobileBar = styled.div`
  display: none;
  ${MOBILE} {
    display: flex;
    gap: ${({ theme }) => theme.space[2]};
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: ${({ theme }) => theme.z.sticky};
    padding: ${({ theme }) =>
      `${theme.space[3]} ${theme.space[4]} calc(${theme.space[6]} + env(safe-area-inset-bottom))`};
    background: ${({ theme }) => theme.color.bg.surface};
    border-top: 1px solid ${({ theme }) => theme.color.border[1]};
    /* Download takes one share, the primary action two (never below its content). */
    & > * {
      flex: 1;
    }
    & > *:nth-child(2) {
      flex: 2;
    }
  }
`;

export const SheetList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
  /* The sheet surface already holds the 16px gutter; rows line up with its title. */
  padding-bottom: ${({ theme }) => theme.space[4]};
  /* Sheet rows read as a menu (canvas .menu-item, 48px): icon and label start-aligned. */
  & > button {
    justify-content: flex-start;
  }
`;

export const PickList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
  max-height: 220px;
  overflow: auto;
`;

export const PickRow = styled.label`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => `${theme.space[2]} ${theme.space[3]}`};
  border-radius: ${({ theme }) => theme.radius.sm};
  cursor: pointer;
  &:hover {
    background: ${({ theme }) => theme.color.bg.subtle};
  }
`;

export const PickWho = styled.span`
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
`;

export const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]};
`;

export const Muted = styled.span`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const MetaLine = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const WithdrawIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.danger[50]};
  color: ${({ theme }) => theme.color.danger[700]};
`;

export const Center = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: ${({ theme }) => theme.space[3]};
`;

export const Sidebar = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[5]};
`;

export const NotFoundHint = styled.p`
  margin: ${({ theme }) => `${theme.space[2]} 0 ${theme.space[4]}`};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const SkelStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

export const SkelRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
`;

export const SkelLines = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

export const MenuLabelRow = styled.span`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
`;

export const MenuHint = styled.span`
  margin-left: auto;
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.fg[3]};
`;
