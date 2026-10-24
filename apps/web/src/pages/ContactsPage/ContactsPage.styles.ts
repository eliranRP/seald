import styled, { css } from 'styled-components';
import { Button } from '@/components/Button';
import { visuallyHidden } from '@/styles/mixins';
import { rise, toastIn } from '@/styles/motion';

const MOBILE = '@media (max-width: 640px)';

/** The scrolling page area under the shell nav. */
export const Main = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  /* Board .container: 1280 border-box with 48px sides → 1184 content. */
  padding: ${({ theme }) => `${theme.space[8]} ${theme.space[12]} ${theme.space[16]}`};
  ${MOBILE} {
    padding: ${({ theme }) => `${theme.space[4]} ${theme.space[4]} ${theme.space[24]}`};
  }
`;

export const Inner = styled.div`
  max-width: 1184px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[5]};
  ${MOBILE} {
    gap: ${({ theme }) => theme.space[3]};
  }
`;

export const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
`;

export const Title = styled.h1`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.x4l};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  line-height: ${({ theme }) => theme.font.lineHeight.tight};
  letter-spacing: ${({ theme }) => theme.font.tracking.tight};
  color: ${({ theme }) => theme.color.fg[1]};
  ${MOBILE} {
    font-size: ${({ theme }) => theme.font.size.x3l};
  }
`;

/** Round count next to the title (canvas `.count`). */
export const Count = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.ink[100]};
  color: ${({ theme }) => theme.color.ink[600]};
  font-size: ${({ theme }) => theme.font.size.xs};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  line-height: 1;
`;

export const Spacer = styled.span`
  flex: 1;
`;

export const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
`;

export const SearchField = styled.label`
  flex: 1;
  max-width: 360px;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  height: 40px;
  padding: 0 ${({ theme }) => theme.space[3]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.paper};
  color: ${({ theme }) => theme.color.fg[3]};
  transition:
    border-color ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard},
    box-shadow ${({ theme }) => theme.motion.durBase} ${({ theme }) => theme.motion.easeOut};

  &:focus-within {
    border-color: ${({ theme }) => theme.color.indigo[600]};
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }

  input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    font: ${({ theme }) =>
      `${theme.font.weight.regular} ${theme.font.size.bodySm} ${theme.font.sans}`};
    color: ${({ theme }) => theme.color.fg[1]};
  }
  input::placeholder {
    color: ${({ theme }) => theme.color.fg[3]};
  }
  ${MOBILE} {
    max-width: none;
    height: 44px;
  }
`;

export const Meta = styled.span`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Table = styled.div`
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  /* Row menus open over the table edge, so it must not clip. */
  overflow: visible;
`;

const GRID = css`
  display: grid;
  grid-template-columns: 28px minmax(0, 2.4fr) minmax(0, 1.7fr) minmax(0, 1.2fr) 88px 172px;
  gap: ${({ theme }) => theme.space[4]};
  align-items: center;
  padding: 0 ${({ theme }) => theme.space[5]};
`;

export const THead = styled.div`
  ${GRID}
  height: 44px;
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => `${theme.radius.lg} ${theme.radius.lg} 0 0`};
  font-size: ${({ theme }) => theme.font.size.xs};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Row = styled.div<{ $selected?: boolean; $static?: boolean }>`
  ${GRID}
  position: relative;
  min-height: 64px;
  padding-top: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid ${({ theme }) => theme.color.ink[150]};
  background: ${({ theme, $selected }) => ($selected ? theme.color.indigo[50] : 'transparent')};
  ${({ $static }) => ($static ? '' : rise)}

  &:last-child {
    border-bottom: 0;
    border-radius: ${({ theme }) => `0 0 ${theme.radius.lg} ${theme.radius.lg}`};
  }
  &:hover {
    background: ${({ theme, $selected }) =>
      $selected ? theme.color.indigo[50] : theme.color.ink[50]};
  }
`;

/** Grid cell: centres a checkbox or link on the row instead of the text baseline. */
export const Cell = styled.span`
  display: flex;
  align-items: center;
  min-width: 0;
`;

export const NameCell = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  min-width: 0;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Ellipsis = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const Quiet = styled(Ellipsis)`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const DocsLink = styled.a`
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.indigo[700]};
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
  &:focus-visible {
    outline: 0;
    box-shadow: ${({ theme }) => theme.shadow.focus};
    border-radius: ${({ theme }) => theme.radius.xxs};
  }
`;

/** Send + more: visible on hover and keyboard focus, like the Documents rows. */
export const RowActions = styled.div`
  justify-self: end;
  display: flex;
  gap: ${({ theme }) => theme.space[1]};
  opacity: 0;
  transition: opacity ${({ theme }) => theme.motion.durFast}
    ${({ theme }) => theme.motion.easeStandard};

  ${Row}:hover &,
  ${Row}:focus-within & {
    opacity: 1;
  }
`;

export const CheckBox = styled.input`
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: ${({ theme }) => theme.color.indigo[600]};
  cursor: pointer;
`;

export const SrOnly = styled.span`
  ${visuallyHidden}
`;

/** Floating bar while rows are selected (canvas `.bulkbar`). */
export const BulkBar = styled.div`
  position: fixed;
  left: 50%;
  bottom: ${({ theme }) => theme.space[8]};
  transform: translateX(-50%);
  z-index: ${({ theme }) => theme.z.sticky};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  padding: 8px 8px 8px 16px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.ink[900]};
  color: ${({ theme }) => theme.color.fgOnAccent};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  box-shadow: ${({ theme }) => theme.shadow.lg};
  ${toastIn}
  ${MOBILE} {
    left: ${({ theme }) => theme.space[4]};
    right: ${({ theme }) => theme.space[4]};
    bottom: 88px;
    transform: none;
    justify-content: flex-end;
  }
`;

/** "Clear" on the dark bar: board `.bulkbar .btn` (ink-700 fill, paper text). */
export const BulkClear = styled(Button)`
  background: ${({ theme }) => theme.color.ink[700]};
  color: ${({ theme }) => theme.color.paper};
  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.color.ink[600]};
  }
`;

export const BulkLabel = styled.span`
  padding: 0 ${({ theme }) => theme.space[2]};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  ${MOBILE} {
    margin-right: auto;
  }
`;

export const SkeletonRow = styled(Row)`
  &:hover {
    background: transparent;
  }
`;

export const AvatarStack = styled.div`
  display: flex;
  justify-content: center;
  & > * + * {
    margin-left: -8px;
  }
`;

/* ---- Mobile list ---------------------------------------------------- */

export const MobileList = styled.div`
  display: flex;
  flex-direction: column;
  /* Bleeds to the screen edges; 8px under the toolbar like the board. */
  margin: -${({ theme }) => theme.space[1]} -${({ theme }) => theme.space[4]} 0;
`;

export const MobileRow = styled.button<{ $selected?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  width: 100%;
  min-height: 64px;
  padding: ${({ theme }) => `10px ${theme.space[4]}`};
  border: 0;
  border-bottom: 1px solid ${({ theme }) => theme.color.ink[150]};
  background: ${({ theme, $selected }) => ($selected ? theme.color.indigo[50] : theme.color.paper)};
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
  ${rise}

  &:focus-visible {
    outline: 0;
    box-shadow: inset ${({ theme }) => theme.shadow.focus};
  }
`;

export const MobileName = styled.span`
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;

  /* Name line (board .sgn-name); the email line is a Quiet. */
  & > :first-child {
    font-size: ${({ theme }) => theme.font.size.bodySm};
    font-weight: ${({ theme }) => theme.font.weight.semibold};
    color: ${({ theme }) => theme.color.fg[1]};
  }
`;

export const MobileMeta = styled.span`
  flex: none;
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const SheetHead = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => `${theme.space[1]} ${theme.space[1]} ${theme.space[3]}`};
`;

export const SheetActions = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
  padding-top: ${({ theme }) => theme.space[2]};
  border-top: 1px solid ${({ theme }) => theme.color.ink[150]};
`;
