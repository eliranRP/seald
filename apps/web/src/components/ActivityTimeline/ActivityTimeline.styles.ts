import styled, { css, keyframes, type DefaultTheme } from 'styled-components';
import type { ActivityTimelineTone } from './ActivityTimeline.types';

export const toneColors = (t: DefaultTheme, tone: ActivityTimelineTone) => {
  switch (tone) {
    case 'indigo':
      return { dot: t.color.indigo[600], bg: t.color.indigo[50], fg: t.color.indigo[800] };
    case 'success':
      return { dot: t.color.success[500], bg: t.color.success[50], fg: t.color.success[700] };
    case 'amber':
      return { dot: t.color.warn[500], bg: t.color.warn[50], fg: t.color.warn[700] };
    case 'danger':
      return { dot: t.color.danger[500], bg: t.color.danger[50], fg: t.color.danger[700] };
    case 'slate':
    default:
      return { dot: t.color.fg[4], bg: t.color.ink[100], fg: t.color.fg[2] };
  }
};

const pulse = keyframes`
  0%, 100% { box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.18); }
  50%      { box-shadow: 0 0 0 10px rgba(245, 158, 11, 0); }
`;

export const Root = styled.div`
  position: relative;
  padding-left: 8px;
`;

export const Rail = styled.div`
  position: absolute;
  left: 15px;
  top: 10px;
  bottom: 10px;
  width: 2px;
  background: ${({ theme }) => theme.color.ink[200]};
  border-radius: 1px;
`;

export const ProgressRail = styled.div<{ $heightPct: number }>`
  position: absolute;
  left: 15px;
  top: 10px;
  width: 2px;
  background: ${({ theme }) => theme.color.indigo[600]};
  height: ${({ $heightPct }) => `${$heightPct}%`};
  box-shadow: 0 0 12px rgba(79, 70, 229, 0.35);
  transition: height 700ms cubic-bezier(0.2, 0.8, 0.2, 1);
  border-radius: 1px;
`;

export const Row = styled.div<{ $visible: boolean }>`
  display: flex;
  gap: 18px;
  padding: 10px 0 18px;
  position: relative;
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  transform: ${({ $visible }) => ($visible ? 'translateY(0)' : 'translateY(8px)')};
  transition:
    opacity 350ms ease,
    transform 350ms cubic-bezier(0.2, 0.8, 0.2, 1);
`;

export const DotWrap = styled.div`
  flex-shrink: 0;
  position: relative;
  z-index: 2;
`;

export const Dot = styled.div<{
  $tone: ActivityTimelineTone;
  $visible: boolean;
  $pending: boolean;
}>`
  width: 32px;
  height: 32px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.bg.surface};
  border: 2px solid ${({ theme, $tone }) => toneColors(theme, $tone).dot};
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme, $tone }) => toneColors(theme, $tone).dot};
  transition: box-shadow 500ms ease;
  ${({ $visible, $tone, theme }) =>
    $visible
      ? css`
          box-shadow: 0 0 0 4px ${toneColors(theme, $tone).bg};
        `
      : ''}
  ${({ $pending }) =>
    $pending
      ? css`
          animation: ${pulse} 2s ease-in-out infinite;
        `
      : ''}
`;

export const Body = styled.div`
  flex: 1;
  min-width: 0;
  padding-top: 4px;
`;

export const BodyHead = styled.div`
  display: flex;
  gap: 10px;
  align-items: baseline;
  flex-wrap: wrap;
`;

export const Text = styled.div`
  font-size: 14px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const KindPill = styled.span<{ $tone: ActivityTimelineTone }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  padding: 2px 8px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme, $tone }) => toneColors(theme, $tone).bg};
  color: ${({ theme, $tone }) => toneColors(theme, $tone).fg};
  letter-spacing: 0.03em;
  text-transform: lowercase;
`;

export const BodyMeta = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  margin-top: 4px;
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
`;

export const BodyBy = styled.span`
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const BodyAt = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
`;

export const BodyPending = styled.span`
  font-style: italic;
`;

export const Empty = styled.div`
  padding: 24px 0;
  color: ${({ theme }) => theme.color.fg[3]};
  font-size: 13px;
`;
