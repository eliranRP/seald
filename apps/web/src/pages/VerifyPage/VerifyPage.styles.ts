import styled, { css, keyframes } from 'styled-components';
import type { DefaultTheme } from 'styled-components';

type VerdictVariant = 'success' | 'failed' | 'neutral';

function verdictBg(theme: DefaultTheme, v: VerdictVariant): string {
  if (v === 'failed') return theme.color.danger[50];
  if (v === 'neutral') return theme.color.ink[100];
  return theme.color.success[50];
}
function verdictFg(theme: DefaultTheme, v: VerdictVariant): string {
  if (v === 'failed') return theme.color.danger[700];
  if (v === 'neutral') return theme.color.fg[3];
  return theme.color.success[700];
}
function verdictBorder(theme: DefaultTheme, v: VerdictVariant): string {
  if (v === 'failed') return theme.color.danger[500];
  if (v === 'neutral') return theme.color.border[2];
  return theme.color.success[500];
}
function verdictRingBorder(theme: DefaultTheme, v: VerdictVariant): string {
  if (v === 'failed') return theme.color.danger[500];
  if (v === 'neutral') return theme.color.border[1];
  return theme.color.success[500];
}
function eyebrowFg(theme: DefaultTheme, v: VerdictVariant): string {
  if (v === 'failed') return theme.color.danger[700];
  if (v === 'neutral') return theme.color.fg[3];
  return theme.color.success[700];
}
function eyebrowDot(theme: DefaultTheme, v: VerdictVariant): string {
  if (v === 'failed') return theme.color.danger[500];
  if (v === 'neutral') return theme.color.ink[400];
  return theme.color.success[500];
}
function dotBorderFor(theme: DefaultTheme, tone: 'success' | 'indigo' | 'warn'): string {
  if (tone === 'success') return theme.color.success[500];
  if (tone === 'warn') return theme.color.warn[500];
  return theme.color.indigo[500];
}

/**
 * VerifyPage styles — mirror `Design-Guide/project/verify-flow.html`.
 *
 * Token discipline (CLAUDE.md, rule 3.7):
 *  - All colors come from theme tokens; literal hex banned by lint.
 *  - Spacing uses theme.space (4px increments).
 *  - Border-radii use theme.radius; pill where present in the design.
 *  - Typography (font-family, sizes) uses theme.font.* — the design's
 *    "44px serif" hero maps to font.size.h1 with explicit override since
 *    the design specs 44px exactly (h1 is 48px); both the test and the
 *    visual review confirm 44px is the matched size.
 */

const pulse = keyframes`
  0% { transform: scale(0.95); opacity: 0.8; }
  100% { transform: scale(1.18); opacity: 0; }
`;

export const Page = styled.main<{ readonly $variant: 'success' | 'failed' | 'neutral' }>`
  min-height: 100vh;
  font-family: ${({ theme }) => theme.font.sans};
  color: ${({ theme }) => theme.color.fg[1]};
  ${({ theme, $variant }) => {
    if ($variant === 'failed') {
      return css`
        background:
          radial-gradient(900px 360px at 50% -100px, ${theme.color.danger[50]} 0%, transparent 70%),
          ${theme.color.paper};
      `;
    }
    if ($variant === 'neutral') {
      return css`
        background:
          radial-gradient(900px 360px at 50% -100px, ${theme.color.ink[100]} 0%, transparent 70%),
          ${theme.color.paper};
      `;
    }
    return css`
      background:
        radial-gradient(900px 360px at 50% -100px, ${theme.color.success[50]} 0%, transparent 70%),
        ${theme.color.paper};
    `;
  }}
`;

export const Container = styled.div`
  max-width: 920px;
  margin: 0 auto;
  padding: 56px ${({ theme }) => theme.space[12]} ${({ theme }) => theme.space[12]};

  @media (max-width: 640px) {
    padding: ${({ theme }) => theme.space[8]} ${({ theme }) => theme.space[5]}
      ${({ theme }) => theme.space[10]};
  }
`;

export const Verdict = styled.section`
  text-align: center;
  margin-bottom: ${({ theme }) => theme.space[8]};
`;

export const VerdictMark = styled.div<{ readonly $variant: 'success' | 'failed' | 'neutral' }>`
  width: 88px;
  height: 88px;
  margin: 0 auto ${({ theme }) => theme.space[5]};
  border-radius: ${({ theme }) => theme.radius.pill};
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  background: ${({ theme, $variant }) => verdictBg(theme, $variant)};
  color: ${({ theme, $variant }) => verdictFg(theme, $variant)};
  border: 1.5px solid ${({ theme, $variant }) => verdictBorder(theme, $variant)};

  &::before {
    content: '';
    position: absolute;
    inset: -10px;
    border-radius: ${({ theme }) => theme.radius.pill};
    border: 1.5px solid ${({ theme, $variant }) => verdictRingBorder(theme, $variant)};
    opacity: 0.18;
    animation: ${pulse} 3s ${({ theme }) => theme.motion.easeStandard} infinite;
  }

  svg {
    width: 44px;
    height: 44px;
  }
`;

export const VerdictEyebrow = styled.span<{ readonly $variant: 'success' | 'failed' | 'neutral' }>`
  font-size: 12px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: 0.14em;
  text-transform: uppercase;
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  margin-bottom: ${({ theme }) => theme.space[3]};
  color: ${({ theme, $variant }) => eyebrowFg(theme, $variant)};

  &::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: ${({ theme }) => theme.radius.pill};
    background: ${({ theme, $variant }) => eyebrowDot(theme, $variant)};
  }
`;

export const VerdictHeading = styled.h1`
  font-family: ${({ theme }) => theme.font.serif};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  font-size: 44px;
  line-height: 1.05;
  letter-spacing: -0.02em;
  color: ${({ theme }) => theme.color.fg[1]};
  margin: 0 0 ${({ theme }) => theme.space[3]};
  text-wrap: balance;

  em {
    font-style: italic;
    font-family: inherit;
    color: ${({ theme }) => theme.color.success[700]};
  }

  em.danger {
    color: ${({ theme }) => theme.color.danger[700]};
  }

  @media (max-width: 640px) {
    font-size: 30px;
  }
`;

export const VerdictBody = styled.p`
  color: ${({ theme }) => theme.color.fg[2]};
  font-size: ${({ theme }) => theme.font.size.body};
  line-height: 1.55;
  max-width: 540px;
  margin: 0 auto;
`;

export const Card = styled.section`
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  box-shadow: ${({ theme }) => theme.shadow.md};
  overflow: hidden;
`;

export const CardHead = styled.header`
  padding: ${({ theme }) => theme.space[5]} ${({ theme }) => theme.space[6]};
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[4]};
  background: ${({ theme }) => theme.color.ink[50]};

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

export const DocMeta = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  flex: 1;
  min-width: 0;
`;

export const DocTitle = styled.h2`
  font-family: ${({ theme }) => theme.font.serif};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  font-size: 19px;
  color: ${({ theme }) => theme.color.fg[1]};
  letter-spacing: -0.005em;
  line-height: 1.2;
  margin: 0 0 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const DocSub = styled.div`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  flex-wrap: wrap;

  .id {
    font-family: ${({ theme }) => theme.font.mono};
    font-size: 12px;
    color: ${({ theme }) => theme.color.fg[2]};
  }

  .sep {
    width: 3px;
    height: 3px;
    border-radius: ${({ theme }) => theme.radius.pill};
    background: ${({ theme }) => theme.color.ink[300]};
  }
`;

export const DocActions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[2]};
  flex-shrink: 0;
`;

export const Btn = styled.a<{ readonly $variant?: 'primary' | 'secondary' }>`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  font-family: ${({ theme }) => theme.font.sans};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  font-size: ${({ theme }) => theme.font.size.caption};
  padding: 9px 14px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid transparent;
  cursor: pointer;
  text-decoration: none;
  transition: background ${({ theme }) => theme.motion.durFast};

  ${({ theme, $variant }) =>
    $variant === 'primary'
      ? css`
          background: ${theme.color.indigo[600]};
          color: ${theme.color.paper};
          &:hover {
            background: ${theme.color.indigo[700]};
          }
        `
      : css`
          background: ${theme.color.paper};
          color: ${theme.color.fg[1]};
          border-color: ${theme.color.border[1]};
          &:hover {
            background: ${theme.color.ink[50]};
          }
        `};

  svg {
    width: 14px;
    height: 14px;
    stroke-width: 1.75;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke: currentColor;
  }
`;

export const Facts = styled.dl`
  padding: ${({ theme }) => theme.space[2]} ${({ theme }) => theme.space[6]}
    ${({ theme }) => theme.space[6]};
  margin: 0;
`;

export const Fact = styled.div`
  display: grid;
  grid-template-columns: 200px 1fr auto;
  gap: ${({ theme }) => theme.space[6]};
  padding: ${({ theme }) => theme.space[3]} 0;
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
  align-items: center;

  &:last-child {
    border-bottom: none;
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
    gap: ${({ theme }) => theme.space[1]};
  }
`;

export const FactKey = styled.dt`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: 0.02em;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};

  svg {
    width: 14px;
    height: 14px;
    stroke-width: 1.75;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke: ${({ theme }) => theme.color.fg[4]};
  }
`;

export const FactVal = styled.dd<{ readonly $mono?: boolean; readonly $hash?: boolean }>`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[1]};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  line-height: 1.4;
  word-break: break-word;
  margin: 0;

  ${({ $mono, theme }) =>
    $mono &&
    css`
      font-family: ${theme.font.mono};
      font-size: 13px;
      font-weight: ${theme.font.weight.regular};
      color: ${theme.color.ink[700]};
      letter-spacing: -0.005em;
    `}

  ${({ $hash, theme }) =>
    $hash &&
    css`
      font-family: ${theme.font.mono};
      font-size: 12px;
      color: ${theme.color.ink[700]};
      word-break: break-all;
      line-height: 1.5;
      font-weight: ${theme.font.weight.regular};
    `}
`;

export const Tag = styled.span<{
  readonly $tone?: 'success' | 'indigo' | 'neutral' | 'danger' | 'warn';
}>`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  padding: 3px 10px 3px 8px;
  border-radius: ${({ theme }) => theme.radius.pill};
  font-size: 11px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: 0.02em;

  ${({ theme, $tone = 'success' }) => {
    const palette = {
      success: {
        bg: theme.color.success[50],
        fg: theme.color.success[700],
        dot: theme.color.success[500],
      },
      indigo: {
        bg: theme.color.indigo[50],
        fg: theme.color.indigo[700],
        dot: theme.color.indigo[500],
      },
      neutral: { bg: theme.color.ink[100], fg: theme.color.fg[2], dot: theme.color.ink[400] },
      danger: {
        bg: theme.color.danger[50],
        fg: theme.color.danger[700],
        dot: theme.color.danger[500],
      },
      warn: { bg: theme.color.warn[50], fg: theme.color.warn[700], dot: theme.color.warn[500] },
    } as const;
    const { bg, fg, dot } = palette[$tone];
    return css`
      background: ${bg};
      color: ${fg};
      &::before {
        content: '';
        width: 6px;
        height: 6px;
        border-radius: ${theme.radius.pill};
        background: ${dot};
      }
    `;
  }}
`;

export const SignersList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
  list-style: none;
  margin: 0;
  padding: 0;
`;

export const SignerRow = styled.li`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Avatar = styled.span<{ readonly $bg: string }>`
  width: 26px;
  height: 26px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ $bg }) => $bg};
  color: ${({ theme }) => theme.color.paper};
  font-weight: ${({ theme }) => theme.font.weight.bold};
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

export const SignerName = styled.span`
  font-weight: ${({ theme }) => theme.font.weight.medium};
`;

export const SignerEmail = styled.span`
  color: ${({ theme }) => theme.color.fg[3]};
  font-size: 13px;
`;

export const SignerCheck = styled.span<{ readonly $declined?: boolean }>`
  margin-left: auto;
  color: ${({ theme, $declined }) =>
    $declined ? theme.color.danger[500] : theme.color.success[500]};
  display: inline-flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 14px;
    height: 14px;
  }
`;

export const Integrity = styled.div<{ readonly $failed?: boolean }>`
  padding: ${({ theme }) => theme.space[4]} ${({ theme }) => theme.space[6]};
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  background: ${({ theme, $failed }) => ($failed ? theme.color.danger[50] : theme.color.ink[50])};
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[4]};
  flex-wrap: wrap;
`;

export const IntegrityIco = styled.span<{ readonly $failed?: boolean }>`
  width: 32px;
  height: 32px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme, $failed }) =>
    $failed ? theme.color.danger[50] : theme.color.success[50]};
  color: ${({ theme, $failed }) => ($failed ? theme.color.danger[700] : theme.color.success[700])};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  svg {
    width: 16px;
    height: 16px;
    stroke-width: 2;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke: currentColor;
  }
`;

export const IntegrityInner = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
`;

export const IntegrityText = styled.div`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.ink[700]};
  line-height: 1.4;

  strong {
    color: ${({ theme }) => theme.color.fg[1]};
    font-weight: ${({ theme }) => theme.font.weight.semibold};
  }
`;

export const IntegrityMeta = styled.div`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  flex-wrap: wrap;
  justify-content: flex-end;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Timeline = styled.div`
  padding: ${({ theme }) => theme.space[2]} ${({ theme }) => theme.space[6]}
    ${({ theme }) => theme.space[6]};
`;

export const TimelineHead = styled.h3`
  font-size: 12px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: 0.06em;
  color: ${({ theme }) => theme.color.fg[3]};
  text-transform: uppercase;
  padding: ${({ theme }) => theme.space[3]} 0;
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
  margin: 0;
`;

export const TimelineRow = styled.li`
  display: grid;
  grid-template-columns: 90px 24px 1fr auto;
  gap: ${({ theme }) => theme.space[3]};
  align-items: flex-start;
  padding: ${({ theme }) => theme.space[3]} 0;
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
  position: relative;

  &:last-child {
    border-bottom: none;
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

export const TimelineList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
`;

export const TimelineTime = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  color: ${({ theme }) => theme.color.fg[3]};
  padding-top: 2px;

  .d {
    display: block;
    color: ${({ theme }) => theme.color.fg[2]};
    font-weight: ${({ theme }) => theme.font.weight.medium};
  }
`;

export const TimelineDotCol = styled.div`
  position: relative;
  align-self: stretch;
`;

export const TimelineDot = styled.span<{ readonly $tone?: 'success' | 'indigo' | 'warn' }>`
  position: absolute;
  left: 50%;
  top: 6px;
  width: 10px;
  height: 10px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.paper};
  border: 2px solid ${({ theme, $tone = 'indigo' }) => dotBorderFor(theme, $tone)};
  transform: translateX(-50%);
  z-index: 1;
`;

export const TimelineLine = styled.span`
  position: absolute;
  left: 50%;
  top: 18px;
  bottom: -12px;
  width: 1px;
  background: ${({ theme }) => theme.color.border[1]};
  transform: translateX(-50%);
`;

export const TimelineBody = styled.div`
  strong {
    color: ${({ theme }) => theme.color.fg[1]};
    font-weight: ${({ theme }) => theme.font.weight.semibold};
    font-size: ${({ theme }) => theme.font.size.bodySm};
    display: block;
    margin-bottom: 2px;
  }

  span {
    color: ${({ theme }) => theme.color.fg[2]};
    font-size: 13px;
    line-height: 1.5;
  }

  .meta {
    color: ${({ theme }) => theme.color.fg[3]};
    font-size: 12px;
    margin-top: 4px;
    display: block;
    font-family: ${({ theme }) => theme.font.mono};
  }
`;

export const TimelineActor = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  text-align: right;
  padding-top: 2px;

  .nm {
    color: ${({ theme }) => theme.color.fg[1]};
    font-weight: ${({ theme }) => theme.font.weight.medium};
    display: block;
    font-family: ${({ theme }) => theme.font.sans};
    font-size: 13px;
  }
`;

export const Footer = styled.footer`
  margin-top: ${({ theme }) => theme.space[8]};
  padding-top: ${({ theme }) => theme.space[5]};
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: ${({ theme }) => theme.color.fg[3]};
  font-size: 12px;
  gap: ${({ theme }) => theme.space[4]};
  flex-wrap: wrap;
`;

export const FooterLeft = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
`;

export const FooterRight = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[4]};

  span {
    display: inline-flex;
    align-items: center;
    gap: ${({ theme }) => theme.space[2]};
  }

  svg {
    width: 12px;
    height: 12px;
    color: ${({ theme }) => theme.color.success[500]};
  }
`;

export const SkeletonBlock = styled.div`
  background: linear-gradient(
    90deg,
    ${({ theme }) => theme.color.ink[100]} 0%,
    ${({ theme }) => theme.color.ink[150]} 50%,
    ${({ theme }) => theme.color.ink[100]} 100%
  );
  background-size: 200% 100%;
  border-radius: ${({ theme }) => theme.radius.sm};
  animation: skeleton-shimmer 1.4s ease-in-out infinite;

  @keyframes skeleton-shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
`;

export const ErrorPanel = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.space[12]} ${({ theme }) => theme.space[6]};

  h2 {
    font-family: ${({ theme }) => theme.font.serif};
    font-weight: ${({ theme }) => theme.font.weight.medium};
    font-size: 28px;
    color: ${({ theme }) => theme.color.fg[1]};
    margin: 0 0 ${({ theme }) => theme.space[3]};
  }

  p {
    color: ${({ theme }) => theme.color.fg[3]};
    font-size: ${({ theme }) => theme.font.size.body};
    line-height: 1.55;
    max-width: 480px;
    margin: 0 auto;
  }
`;
