import styled, { css } from 'styled-components';
import { Button } from '@/components/Button';
import { CheckChip } from '@/components/CheckChip';
import { fadeIn, pop, rise, spring } from '@/styles/motion';

/**
 * VerifyPage styles — canvas `Verify.dc.html` / `VerifyMobile.dc.html`
 * (seald.css section 23). Colours, type and radii come from theme tokens;
 * the page is one centred 640px column that drops to 16px gutters at 640px.
 */
const MOBILE = '@media (max-width: 640px)';

export type VerdictTone = 'ok' | 'warn' | 'bad' | 'off';

export const Page = styled.div`
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  min-height: 100vh;
  background: ${({ theme }) => theme.color.bg.subtle};
  font-family: ${({ theme }) => theme.font.sans};
  color: ${({ theme }) => theme.color.fg[1]};
`;

/** `.sign-top` — the public header. */
export const TopBar = styled.header`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  height: 64px;
  padding: 0 ${({ theme }) => theme.space[6]};
  background: ${({ theme }) => theme.color.paper};
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
  ${MOBILE} {
    height: 56px;
    gap: ${({ theme }) => theme.space[2]};
    padding: 0 ${({ theme }) => theme.space[4]};
  }
`;

export const Logo = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
`;

export const LogoMark = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.indigo[600]};
  color: ${({ theme }) => theme.color.fgOnAccent};
  font-family: ${({ theme }) => theme.font.script};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  font-size: ${({ theme }) => theme.font.size.xl};
  line-height: 1;
`;

export const LogoWord = styled.span`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.xl};
  font-weight: ${({ theme }) => theme.font.weight.medium};
`;

export const Spacer = styled.span`
  flex: 1;
`;

export const Stage = styled.main`
  box-sizing: border-box;
  flex: 1;
  display: flex;
  justify-content: center;
  padding: ${({ theme }) => theme.space[16]} ${({ theme }) => theme.space[6]}
    ${({ theme }) => theme.space[10]};
  ${MOBILE} {
    padding: ${({ theme }) => theme.space[4]};
  }
`;

export const Column = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[8]};
  width: 100%;
  max-width: 640px;
  min-width: 0;
  ${MOBILE} {
    gap: 20px;
  }
`;

/* ---- verdict hero ---- */

export const Verdict = styled.section`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  text-align: center;
  ${fadeIn}
`;

const TONES = {
  ok: { bg: 'success', fg: 'success', ring: 'rgba(16, 185, 129, 0.08)' },
  warn: { bg: 'warn', fg: 'warn', ring: 'rgba(245, 158, 11, 0.08)' },
  bad: { bg: 'danger', fg: 'danger', ring: 'rgba(239, 68, 68, 0.08)' },
} as const;

export const VerdictIcon = styled.span<{ readonly $tone: VerdictTone }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 96px;
  height: 96px;
  border-radius: 50%;
  ${spring}
  ${({ theme, $tone }) => {
    if ($tone === 'off') {
      return css`
        background: ${theme.color.ink[100]};
        color: ${theme.color.fg[3]};
      `;
    }
    const t = TONES[$tone];
    return css`
      background: ${theme.color[t.bg][50]};
      color: ${theme.color[t.fg][700]};
      box-shadow: 0 0 0 8px ${t.ring};
    `;
  }}
  ${MOBILE} {
    width: 80px;
    height: 80px;
  }
`;

export const VerdictWord = styled.h1`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.x5l};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  line-height: ${({ theme }) => theme.font.lineHeight.tight};
  color: ${({ theme }) => theme.color.fg[1]};
  ${MOBILE} {
    font-size: ${({ theme }) => theme.font.size.x4l};
  }
`;

export const DocTitle = styled.h2`
  margin: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.body};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Meta = styled.span`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

/** `.avatars` — avatars overlapping by 4px, each with a 2px paper ring. */
export const Avatars = styled.ul`
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  margin: 0;
  padding: 0;
  list-style: none;
`;

export const AvatarSlot = styled.li<{ readonly $faded: boolean }>`
  display: inline-flex;
  border-radius: ${({ theme }) => theme.radius.pill};
  box-shadow: 0 0 0 2px ${({ theme }) => theme.color.paper};
  opacity: ${({ $faded }) => ($faded ? 0.45 : 1)};
  & + & {
    margin-left: -4px;
  }
`;

export const ChipsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: ${({ theme }) => theme.space[2]};
`;

/* ---- compare a copy ---- */

export const DropZone = styled.div<{ readonly $over: boolean }>`
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};
  width: 100%;
  min-height: 96px;
  padding: 0 ${({ theme }) => theme.space[5]};
  border: 1.5px dashed ${({ theme }) => theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.xl};
  background: ${({ theme }) => theme.color.paper};
  color: ${({ theme }) => theme.color.indigo[600]};
  transition:
    background ${({ theme }) => theme.motion.durBase} ${({ theme }) => theme.motion.easeStandard},
    border-color ${({ theme }) => theme.motion.durBase} ${({ theme }) => theme.motion.easeStandard};
  ${({ $over, theme }) =>
    $over &&
    css`
      border-color: ${theme.color.indigo[500]};
      background: ${theme.color.indigo[50]};
    `}
  ${MOBILE} {
    flex-direction: column;
    justify-content: center;
    gap: ${({ theme }) => theme.space[3]};
    padding: 20px ${({ theme }) => theme.space[4]};
    font: inherit;
    text-align: center;
    cursor: pointer;
  }
`;

export const DropText = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
  min-width: 0;
  flex: 1;
  text-align: left;
  ${MOBILE} {
    align-items: center;
    gap: ${({ theme }) => theme.space[3]};
    text-align: center;
  }
`;

export const DropTitle = styled.span`
  font-size: ${({ theme }) => theme.font.size.body};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const HiddenInput = styled.input`
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
`;

export const ResultCard = styled.div<{ readonly $bad?: boolean }>`
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};
  width: 100%;
  padding: ${({ theme }) => theme.space[5]};
  border: 1px solid ${({ theme, $bad }) => ($bad ? theme.color.danger[500] : theme.color.border[1])};
  border-radius: ${({ theme }) => theme.radius.lg};
  background: ${({ theme, $bad }) => ($bad ? theme.color.danger[50] : theme.color.paper)};
  ${pop}
  ${MOBILE} {
    flex-direction: column;
    align-items: flex-start;
    gap: ${({ theme }) => theme.space[3]};
    padding: ${({ theme }) => theme.space[4]};
  }
`;

export const ResultBody = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  flex: 1;
  min-width: 0;
  ${MOBILE} {
    gap: ${({ theme }) => theme.space[3]};
  }
`;

/** The larger `.check-chip` on the match / no-match card (36px, body type). */
export const ResultChip = styled(CheckChip)`
  height: 36px;
  padding: 0 14px;
  font-size: ${({ theme }) => theme.font.size.bodyMd};
  ${MOBILE} {
    height: 40px;
  }
`;

export const CheckingRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  color: ${({ theme }) => theme.color.fg[1]};
  font-size: ${({ theme }) => theme.font.size.body};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  /* Spinner in accent, file name in ink (.h3). */
  & > :first-child {
    color: ${({ theme }) => theme.color.indigo[600]};
  }
  ${MOBILE} {
    font-size: ${({ theme }) => theme.font.size.bodySm};
  }
`;

/* ---- technical details ---- */

export const DetailsCard = styled.section`
  box-sizing: border-box;
  width: 100%;
  padding: ${({ theme }) => theme.space[5]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  background: ${({ theme }) => theme.color.paper};
  ${rise}
  ${MOBILE} {
    padding: 0 ${({ theme }) => theme.space[4]};
  }
`;

export const Expander = styled.button`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  width: 100%;
  height: 48px;
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  text-align: left;
  cursor: pointer;
  &:focus-visible {
    outline: 0;
    border-radius: ${({ theme }) => theme.radius.sm};
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
  & > :last-child {
    margin-left: auto;
    transition: transform ${({ theme }) => theme.motion.durBase}
      ${({ theme }) => theme.motion.easeStandard};
  }
  &[aria-expanded='true'] > :last-child {
    transform: rotate(180deg);
  }
  ${MOBILE} {
    & > span,
    & svg {
      width: 20px;
      height: 20px;
    }
  }
`;

export const KvList = styled.dl`
  display: flex;
  flex-direction: column;
  margin: ${({ theme }) => theme.space[2]} 0 0;
  ${MOBILE} {
    margin: 0;
  }
`;

export const KvRow = styled.div<{ readonly $danger?: boolean }>`
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr) auto;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  min-height: 44px;
  padding: 6px 0;
  border-top: 1px solid ${({ theme }) => theme.color.ink[150]};
  &:first-child {
    border-top: 0;
  }
  /* Mobile: key above value, copy button centred on the right. */
  ${MOBILE} {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: 'key act' 'val act';
    row-gap: 2px;
    min-height: 56px;
  }
  ${({ $danger, theme }) =>
    $danger &&
    css`
      margin: 0 -${theme.space[3]};
      padding: 6px ${theme.space[3]};
      border-top: 0;
      border-radius: ${theme.radius.sm};
      background: ${theme.color.danger[50]};
      color: ${theme.color.danger[700]};
    `}
`;

export const KvKey = styled.dt`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
  ${MOBILE} {
    grid-area: key;
  }
`;

export const KvVal = styled.dd<{ readonly $hash?: boolean }>`
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[1]};
  ${({ $hash, theme }) =>
    $hash &&
    css`
      font-family: ${theme.font.mono};
      font-size: ${theme.font.size.xs};
    `}
  ${MOBILE} {
    grid-area: val;
  }
`;

export const KvAction = styled.dd`
  margin: 0;
  display: inline-flex;
  align-items: center;
  ${MOBILE} {
    grid-area: act;
  }
`;

export const DetailsFoot = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.space[2]};
  margin-top: ${({ theme }) => theme.space[2]};
  ${MOBILE} {
    justify-content: flex-start;
    margin-top: 0;
    padding: ${({ theme }) => theme.space[2]} 0;
    border-top: 1px solid ${({ theme }) => theme.color.ink[150]};
    & > a {
      min-height: 44px;
    }
  }
`;

export const Footer = styled.footer`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

/** The entry page shows the footer on a phone only (VerifyMobile entry). */
export const EntryFooter = styled(Footer)`
  display: none;
  ${MOBILE} {
    display: flex;
  }
`;

/* ---- entry ---- */

export const EntryStack = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[6]};
  ${MOBILE} {
    gap: 20px;
  }
`;

export const EntryTitle = styled.h1`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.x4l};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  line-height: ${({ theme }) => theme.font.lineHeight.tight};
  letter-spacing: ${({ theme }) => theme.font.tracking.tight};
  color: ${({ theme }) => theme.color.fg[1]};
  ${MOBILE} {
    letter-spacing: normal;
  }
`;

export const CodeForm = styled.form`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  width: 100%;
`;

export const CodeInput = styled.input<{ readonly $error: boolean }>`
  box-sizing: border-box;
  width: 100%;
  max-width: 380px;
  height: 56px;
  padding: 0 ${({ theme }) => theme.space[4]};
  border: 1.5px solid
    ${({ theme, $error }) => ($error ? theme.color.danger[500] : theme.color.border[2])};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.paper};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.xl};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  letter-spacing: 0.14em;
  text-align: center;
  color: ${({ theme }) => theme.color.fg[1]};
  ${MOBILE} {
    max-width: none;
    height: 52px;
    font-size: ${({ theme }) => theme.font.size.lg};
  }
  transition:
    border-color ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard},
    box-shadow ${({ theme }) => theme.motion.durBase} ${({ theme }) => theme.motion.easeOut};
  &::placeholder {
    letter-spacing: 0;
    font-family: ${({ theme }) => theme.font.sans};
    font-size: ${({ theme }) => theme.font.size.body};
    font-weight: ${({ theme }) => theme.font.weight.regular};
    color: ${({ theme }) => theme.color.fg[4]};
  }
  &:focus {
    outline: 0;
    border-color: ${({ theme, $error }) =>
      $error ? theme.color.danger[500] : theme.color.indigo[600]};
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

/** Verify submit: 240px on desktop, full width on a phone. */
export const VerifyButton = styled(Button)`
  width: 240px;
  ${MOBILE} {
    width: 100%;
  }
`;

export const InlineAlert = styled.div`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.danger[700]};
`;

export const OrRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  width: 100%;
`;

export const OrRule = styled.span`
  flex: 1;
  height: 1px;
  background: ${({ theme }) => theme.color.border[1]};
`;

export const EntryDrop = styled(DropZone)`
  flex-direction: column;
  justify-content: center;
  gap: ${({ theme }) => theme.space[3]};
  text-align: center;
  padding: 28px ${({ theme }) => theme.space[6]};
  ${MOBILE} {
    padding: 20px ${({ theme }) => theme.space[4]};
  }
  /* Board stacks icon, title and meta with one 12px gap. */
  & > ${DropText} {
    gap: ${({ theme }) => theme.space[3]};
  }
`;

/* ---- loading + errors ---- */

export const LoadingStack = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};
`;

export const SkeletonChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: ${({ theme }) => theme.space[2]};
  & > * {
    border-radius: ${({ theme }) => theme.radius.pill};
  }
`;

export const LoadingNote = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const ErrorPanel = styled.div`
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => theme.space[8]} ${({ theme }) => theme.space[6]};
  border: 1px solid ${({ theme }) => theme.color.danger[200]};
  border-radius: ${({ theme }) => theme.radius.lg};
  background: ${({ theme }) => theme.color.danger[50]};
  text-align: center;
  h2 {
    margin: 0;
    font-size: ${({ theme }) => theme.font.size.xl};
    color: ${({ theme }) => theme.color.danger[800]};
  }
  p {
    margin: 0;
    font-size: ${({ theme }) => theme.font.size.bodySm};
    color: ${({ theme }) => theme.color.fg[2]};
  }
`;
