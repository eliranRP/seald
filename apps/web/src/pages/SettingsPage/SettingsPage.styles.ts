import { Link, NavLink } from 'react-router-dom';
import styled, { css } from 'styled-components';
import { Button } from '@/components/Button';
import { rise } from '@/styles/motion';
import type { SealdTheme } from '@/styles/theme';

const MOBILE = '@media (max-width: 640px)';

/** Canvas `.container`: 1280 max, 32/48/64 padding (1184 content at 1440). */
export const Page = styled.div`
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: ${({ theme }) => `${theme.space[8]} ${theme.space[12]} ${theme.space[16]}`};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[6]};

  ${MOBILE} {
    padding: ${({ theme }) => `0 ${theme.space[4]} ${theme.space[20]}`};
    gap: ${({ theme }) => theme.space[4]};
  }
`;

export const PageTitle = styled.h1`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.x4l};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  line-height: ${({ theme }) => theme.font.lineHeight.tight};
  letter-spacing: ${({ theme }) => theme.font.tracking.tight};
  color: ${({ theme }) => theme.color.fg[1]};

  ${MOBILE} {
    display: none;
  }
`;

export const Layout = styled.div`
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: ${({ theme }) => theme.space[10]};
  align-items: start;

  ${MOBILE} {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const SideNav = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: sticky;
  top: ${({ theme }) => theme.space[6]};

  ${MOBILE} {
    display: none;
  }
`;

export const NavDivider = styled.hr`
  width: 100%;
  margin: ${({ theme }) => `${theme.space[2]} 0`};
  border: 0;
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
`;

export const SideLink = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: 10px;
  height: 40px;
  padding: 0 ${({ theme }) => theme.space[3]};
  border-radius: ${({ theme }) => theme.radius.md};
  color: ${({ theme }) => theme.color.fg[2]};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  text-decoration: none;
  transition:
    background-color ${({ theme }) => theme.motion.durFast}
      ${({ theme }) => theme.motion.easeStandard},
    color ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard};

  &:hover {
    background: ${({ theme }) => theme.color.bg.subtle};
    color: ${({ theme }) => theme.color.fg[1]};
  }

  &.active {
    background: ${({ theme }) => theme.color.indigo[50]};
    color: ${({ theme }) => theme.color.indigo[800]};
    font-weight: ${({ theme }) => theme.font.weight.semibold};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.indigo[500]};
    outline-offset: 2px;
  }
`;

/**
 * Canvas `.m-top`: the phone header with a back chevron and the title. It
 * bleeds to the screen edges through the page's 16px gutter.
 */
const mTop = css`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  height: 56px;
  margin: 0 -${({ theme }) => theme.space[4]};
  padding: 0 ${({ theme }) => theme.space[2]} 0 ${({ theme }) => theme.space[4]};
  background: ${({ theme }) => theme.color.paper};
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
`;

export const MobileTop = styled.div`
  display: none;

  ${MOBILE} {
    ${mTop}
  }
`;

/** The index only renders on a phone, so its header is always shown. */
export const IndexTop = styled.div`
  ${mTop}
`;

/** Ghost 44px icon button (canvas `.btn-ghost.btn-icon`) for the back chevron. */
export const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: ${({ theme }) => theme.radius.md};
  color: ${({ theme }) => theme.color.fg[2]};

  &:hover {
    background: ${({ theme }) => theme.color.bg.subtle};
  }

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

/** Section title in the phone header (canvas `.h3`). */
export const MobileTitle = styled.h1`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.body};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  color: ${({ theme }) => theme.color.fg[1]};
`;

/** Index title in the phone header (canvas `.h2`, 24px serif). */
export const MobileIndexTitle = styled.h1`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.x2l};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  line-height: ${({ theme }) => theme.font.lineHeight.snug};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
  min-width: 0;
  ${rise}
`;

/** Canvas `.card` (20px padding). A phone drops the card: content sits on the page, 20px apart. */
export const Panel = styled.div<{ $gap?: keyof SealdTheme['space'] }>`
  display: flex;
  flex-direction: column;
  gap: ${({ theme, $gap = 6 }) => theme.space[$gap]};
  padding: ${({ theme }) => theme.space[5]};
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};

  ${MOBILE} {
    gap: ${({ theme }) => theme.space[5]};
    padding: 0;
    background: transparent;
    border: 0;
    border-radius: 0;
  }
`;

/** Canvas `.h3` card heading. The phone header already names the section, so it hides there. */
export const CardHeading = styled.h2`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.body};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  color: ${({ theme }) => theme.color.fg[1]};

  ${MOBILE} {
    display: none;
  }
`;

/**
 * Card of setting rows (canvas `.card` with `padding: 4px 20px`). On a phone
 * the rows sit straight on the page; `$mobileRule` draws the rule that
 * separates the danger row there.
 */
export const RowsCard = styled.div<{ $mobileRule?: boolean }>`
  padding: 4px ${({ theme }) => theme.space[5]};
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};

  ${MOBILE} {
    padding: 0;
    background: transparent;
    border: 0;
    border-top: ${({ theme, $mobileRule }) =>
      $mobileRule ? `1px solid ${theme.color.ink[150]}` : '0'};
    border-radius: 0;
  }
`;

/**
 * Canvas `.eyebrow`. `$mobileHidden` drops it on a phone; `$mobileGroup`
 * sits it 24px under the list above and 8px over its own rows there.
 */
export const Eyebrow = styled.span<{
  $danger?: boolean;
  $mobileHidden?: boolean;
  $mobileGroup?: boolean;
}>`
  font-size: ${({ theme }) => theme.font.size.xs};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  letter-spacing: ${({ theme }) => theme.font.tracking.wider};
  text-transform: uppercase;
  color: ${({ theme, $danger }) => ($danger ? theme.color.danger[700] : theme.color.fg[3])};

  ${MOBILE} {
    display: ${({ $mobileHidden }) => ($mobileHidden ? 'none' : 'inline')};
    margin: ${({ $mobileGroup }) => ($mobileGroup ? '8px 0 -8px' : '0')};
  }
`;

export const Meta = styled.span`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

/**
 * Canvas `.setting-row`. `$min` is the desktop row height (the board uses
 * 56, 60 or 64 per list), `$mobileMin` the phone one. `$wrap` rows put their
 * control on its own full-width line on a phone (the two defaults).
 */
export const Row = styled.div<{
  $last?: boolean;
  $min?: number;
  $mobileMin?: number;
  $wrap?: boolean;
}>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  min-height: ${({ $min = 60 }) => `${$min}px`};
  border-bottom: ${({ theme, $last }) => ($last ? '0' : `1px solid ${theme.color.ink[150]}`)};

  ${MOBILE} {
    min-height: ${({ $mobileMin = 56 }) => `${$mobileMin}px`};
    ${({ $wrap, theme }) =>
      $wrap ? `flex-wrap: wrap; align-items: flex-start; padding: ${theme.space[3]} 0;` : ''}

    /* Row actions are 44px touch targets on a phone. */
    & > button {
      min-height: 44px;
    }
  }
`;

/** Wraps a row's segmented control: inline on desktop, a full-width 44px bar on a phone. */
export const RowSegmented = styled.div`
  ${MOBILE} {
    width: 100%;

    & [role='radiogroup'] {
      display: flex;
      width: 100%;
    }
    & [role='radio'] {
      flex: 1;
      height: 44px;
    }
  }
`;

export const RowIcon = styled.span<{ $danger?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: ${({ theme, $danger }) => ($danger ? theme.color.danger[50] : theme.color.ink[100])};
  color: ${({ theme, $danger }) => ($danger ? theme.color.danger[700] : theme.color.fg[2])};

  ${MOBILE} {
    & > span,
    & svg {
      width: 16px;
      height: 16px;
    }
  }
`;

export const RowLabel = styled.span<{ $danger?: boolean }>`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme, $danger }) => ($danger ? theme.color.danger[700] : theme.color.fg[1])};
`;

export const Spacer = styled.span`
  flex: 1;
`;

export const InlineRow = styled.div<{ $gap?: number }>`
  display: flex;
  align-items: center;
  gap: ${({ $gap = 12 }) => `${$gap}px`};
  min-width: 0;
`;

/**
 * Profile's avatar + name row (gap 20). On a phone the avatar takes its own
 * centred line above the field.
 */
export const ProfileHead = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[5]};
  min-width: 0;

  ${MOBILE} {
    flex-direction: column;
    align-items: stretch;

    & > [role='img'] {
      align-self: center;
    }
  }
`;

/** The read-only email line; on a phone it is a 44px row with the badge at the end. */
export const EmailLine = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;

  ${MOBILE} {
    gap: ${({ theme }) => theme.space[3]};
    min-height: 44px;

    & > :first-child {
      flex: 1;
      min-width: 0;
    }
  }
`;

/** Badge content with a leading mark, 6px apart (canvas `.badge` gap). */
export const BadgeMark = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
`;

export const Stack = styled.div<{ $gap?: number }>`
  display: flex;
  flex-direction: column;
  gap: ${({ $gap = 8 }) => `${$gap}px`};
  min-width: 0;
`;

/** Canvas `.field`: 40px, 14px text; 44px on a phone. */
export const NameInput = styled.input`
  width: 100%;
  height: 40px;
  padding: 0 ${({ theme }) => theme.space[3]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.paper};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[1]};

  ${MOBILE} {
    height: 44px;
  }

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.color.border.focus};
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const FieldError = styled.span`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.danger[700]};
`;

/**
 * Canvas `.sig-pad`: 140px (120 on a phone) with the signing baseline; the
 * initials pad is 200 x 72 (full width on a phone). `$drop` is the upload
 * well (canvas `.dropzone`): dashed, no baseline.
 */
export const SigPad = styled.div<{ $small?: boolean; $drop?: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: ${({ $small }) => ($small ? '200px' : '100%')};
  height: ${({ $small }) => ($small ? '72px' : '140px')};
  overflow: hidden;
  background: ${({ theme }) => theme.color.paper};
  border: ${({ theme, $drop }) =>
    $drop ? `1.5px dashed ${theme.color.border[2]}` : `1px solid ${theme.color.border[1]}`};
  border-radius: ${({ theme, $drop }) => ($drop ? theme.radius.xl : theme.radius.md)};

  &::after {
    content: ${({ $drop }) => ($drop ? 'none' : "''")};
    position: absolute;
    left: 24px;
    right: 24px;
    bottom: 32px;
    height: 1px;
    background: ${({ theme }) => theme.color.border[2]};
    pointer-events: none;
  }

  ${MOBILE} {
    width: 100%;
    height: ${({ $small }) => ($small ? '72px' : '120px')};
  }
`;

export const SigInk = styled.span<{ $small?: boolean }>`
  font-family: ${({ theme }) => theme.font.script};
  font-size: ${({ theme, $small }) => ($small ? theme.font.size.x4l : theme.font.size.x5l)};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
`;

export const SigImage = styled.img`
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
`;

export const SigCanvas = styled.canvas`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: crosshair;
`;

export const PadAction = styled.div`
  position: absolute;
  top: ${({ theme }) => theme.space[2]};
  right: ${({ theme }) => theme.space[2]};
`;

export const HiddenFile = styled.input`
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
`;

export const DropLabel = styled.label`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space[3]};
  width: 100%;
  height: 100%;
  cursor: pointer;
  color: ${({ theme }) => theme.color.fg[2]};
  text-align: center;

  /* Canvas .dropzone icon in the accent colour. */
  & > span:first-child {
    color: ${({ theme }) => theme.color.indigo[600]};
  }

  &:focus-within {
    outline: 2px solid ${({ theme }) => theme.color.indigo[500]};
    outline-offset: -2px;
  }
`;

export const DirtyBar = styled.div`
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: ${({ theme }) => theme.z.sticky};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  min-height: 72px;
  padding: 0 ${({ theme }) => theme.space[12]};
  background: ${({ theme }) => theme.color.paper};
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  box-shadow: ${({ theme }) => theme.shadow.md};

  ${MOBILE} {
    padding: 0 ${({ theme }) => theme.space[4]};
    padding-bottom: env(safe-area-inset-bottom);
  }
`;

export const IntegrationCard = styled.div<{ $stack?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
  padding: ${({ theme }) => theme.space[5]};
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  ${rise}

  ${MOBILE} {
    gap: ${({ theme }) => theme.space[3]};
  }
`;

export const IntegrationHead = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};

  ${MOBILE} {
    flex-wrap: wrap;

    /* Connect takes its own full-width line under the title. */
    & > button {
      width: 100%;
    }
  }
`;

export const IntegrationLogo = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 48px;
  height: 48px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.bg.subtle};
  color: ${({ theme }) => theme.color.fg[2]};
`;

/** Canvas `.h3`: 16px semibold. */
export const CardTitle = styled.div`
  font-size: ${({ theme }) => theme.font.size.body};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const AccountLine = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  padding-top: ${({ theme }) => theme.space[4]};
  border-top: 1px solid ${({ theme }) => theme.color.ink[150]};

  ${MOBILE} {
    min-height: 56px;
    padding-top: ${({ theme }) => theme.space[3]};

    & > button {
      min-height: 44px;
    }
  }
`;

export const AccountEmail = styled.div`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  overflow-wrap: anywhere;
`;

export const Grow = styled.div`
  flex: 1;
  min-width: 0;
`;

export const IndexList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
`;

/** 36px icon disc on an index row (the canvas inline disc). */
export const IndexIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: ${({ theme }) => theme.color.ink[100]};
  color: ${({ theme }) => theme.color.fg[2]};
`;

/** Trailing chevron on an index row, in `fg-3`. */
export const Chevron = styled.span`
  display: inline-flex;
  color: ${({ theme }) => theme.color.fg[3]};
`;

/** Canvas `.m-card` row: 64px, 12px padding, 15px semibold label. */
export const IndexLink = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  min-height: 64px;
  padding: ${({ theme }) => theme.space[3]};
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  color: ${({ theme }) => theme.color.fg[1]};
  font-size: ${({ theme }) => theme.font.size.bodyMd};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  text-decoration: none;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.indigo[500]};
    outline-offset: 2px;
  }
`;

export const Lock = styled.span`
  display: inline-flex;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const DialogIconBubble = styled.span<{ $bad?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: ${({ theme, $bad }) => ($bad ? theme.color.danger[50] : theme.color.bg.subtle)};
  color: ${({ theme, $bad }) => ($bad ? theme.color.danger[700] : theme.color.fg[2])};
`;

export const DialogCenter = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  text-align: center;
`;

export const DangerButton = styled(Button)`
  && {
    color: ${({ theme }) => theme.color.danger[700]};
  }
`;
