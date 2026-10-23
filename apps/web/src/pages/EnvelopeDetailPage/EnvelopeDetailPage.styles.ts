import styled, { css } from 'styled-components';
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
  padding: ${({ theme }) => `${theme.space[8]} ${theme.space[6]} ${theme.space[20]}`};
  ${MOBILE} {
    padding: ${({ theme }) => `${theme.space[4]} ${theme.space[4]} 176px`};
    gap: ${({ theme }) => theme.space[4]};
  }
`;

export const BackRow = styled.div`
  display: flex;
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
  gap: ${({ theme }) => theme.space[3]};
`;

export const Title = styled.h1`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.x4l};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  letter-spacing: ${({ theme }) => theme.font.tracking.tight};
  color: ${({ theme }) => theme.color.fg[1]};
  line-height: ${({ theme }) => theme.font.lineHeight.snug};
  overflow-wrap: anywhere;
  ${MOBILE} {
    font-size: ${({ theme }) => theme.font.size.x2l};
  }
`;

export const HeadMeta = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[3]};
  align-items: center;
  flex-wrap: wrap;
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const HeadCode = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
`;

export const HeadActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  flex: none;
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

export const Split = styled.div`
  display: inline-flex;
  & > button:first-child {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
  & > button:last-child {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    margin-left: -1px;
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
    flex-wrap: wrap;
    padding-top: ${({ theme }) => theme.space[4]};
    padding-bottom: ${({ theme }) => theme.space[4]};
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
  gap: ${({ theme }) => theme.space[2]};
  flex: none;
`;

export const SummaryOk = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  flex: none;
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
`;

export const BarFill = styled.div<{ readonly $pct: number; readonly $tone: 'ok' | 'bad' | 'base' }>`
  height: 100%;
  width: ${({ $pct }) => `${$pct}%`};
  border-radius: inherit;
  background: ${({ theme, $tone }) =>
    ({ ok: theme.color.success[500], bad: theme.color.danger[500], base: theme.color.indigo[600] })[
      $tone
    ]};
  transition: width ${({ theme }) => theme.motion.durEnter} ${({ theme }) => theme.motion.easeOut};
`;

export const CardHead = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  padding: ${({ theme }) => `${theme.space[4]} ${theme.space[5]} ${theme.space[3]}`};
`;

export const Eyebrow = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.micro};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: ${({ theme }) => theme.font.tracking.wider};
  color: ${({ theme }) => theme.color.fg[3]};
  text-transform: uppercase;
`;

export const Count = styled.span`
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Spacer = styled.span`
  flex: 1;
`;

export const SignerList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

export const SignerItem = styled.li<{ readonly $bad: boolean }>`
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  ${({ $bad, theme }) =>
    $bad &&
    css`
      background: ${theme.color.danger[50]};
    `}
`;

export const SignerGrid = styled.div`
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto 128px auto;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[5]}`};
  ${MOBILE} {
    grid-template-columns: 36px minmax(0, 1fr) auto;
    grid-template-areas:
      'av who act'
      'av track when';
    row-gap: ${({ theme }) => theme.space[2]};
    gap: ${({ theme }) => theme.space[3]};
    padding: ${({ theme }) => theme.space[4]};
  }
`;

export const SignerWho = styled.div`
  min-width: 0;
  ${MOBILE} {
    grid-area: who;
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
  ${MOBILE} {
    grid-area: track;
  }
`;

export const When = styled.span<{ readonly $bad: boolean }>`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme, $bad }) => ($bad ? theme.color.danger[700] : theme.color.fg[3])};
  ${MOBILE} {
    grid-area: when;
    text-align: right;
  }
`;

export const RowActions = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.space[1]};
  ${MOBILE} {
    grid-area: act;
  }
`;

export const FixRow = styled.form`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[5]} ${theme.space[4]} 68px`};
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  ${MOBILE} {
    padding-left: ${({ theme }) => theme.space[4]};
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
  }
`;

export const ActList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

export const ActRow = styled.li`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => `${theme.space[2]} 0`};
`;

export const ActIcon = styled.span<{ readonly $tone: 'neutral' | 'ok' | 'bad' }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme, $tone }) =>
    ({ ok: theme.color.success[50], bad: theme.color.danger[50], neutral: theme.color.ink[100] })[
      $tone
    ]};
  color: ${({ theme, $tone }) =>
    ({ ok: theme.color.success[700], bad: theme.color.danger[700], neutral: theme.color.fg[3] })[
      $tone
    ]};
`;

export const ActText = styled.span`
  flex: 1;
  min-width: 0;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const ActTime = styled.span`
  flex: none;
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const ChainOk = styled.span<{ readonly $ok: boolean }>`
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
    bottom: calc(80px + env(safe-area-inset-bottom));
    z-index: ${({ theme }) => theme.z.sticky};
    padding: ${({ theme }) => `${theme.space[3]} ${theme.space[4]}`};
    background: ${({ theme }) => theme.color.bg.surface};
    border-top: 1px solid ${({ theme }) => theme.color.border[1]};
    & > * {
      flex: 1;
    }
  }
`;

export const SheetList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
  padding: ${({ theme }) => `0 ${theme.space[4]} ${theme.space[4]}`};
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
  gap: ${({ theme }) => theme.space[4]};
`;

export const SkelRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
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
