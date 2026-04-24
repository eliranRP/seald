import styled, { css, keyframes } from 'styled-components';

const shine = keyframes`
  0%   { transform: translateX(-40px); }
  100% { transform: translateX(40px); }
`;

const pulseRing = keyframes`
  0%   { transform: scale(0.9); opacity: 0.5; }
  100% { transform: scale(1.35); opacity: 0; }
`;

export const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 120;
  background: radial-gradient(
    1200px 600px at 50% -10%,
    ${({ theme }) => theme.color.indigo[50]} 0%,
    ${({ theme }) => theme.color.bg.app} 55%
  );
  padding: 60px 24px 120px;
  display: flex;
  justify-content: center;
  overflow: auto;
  font-family: ${({ theme }) => theme.font.sans};
`;

export const Wrap = styled.div`
  width: 100%;
  max-width: 960px;
`;

export const Kicker = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: 0.1em;
  color: ${({ theme }) => theme.color.indigo[600]};
  text-transform: uppercase;
  text-align: center;
  margin-bottom: ${({ theme }) => theme.space[2]};
`;

export const Title = styled.h1`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 42px;
  font-weight: ${({ theme }) => theme.font.weight.medium};
  letter-spacing: -0.02em;
  color: ${({ theme }) => theme.color.fg[1]};
  margin: 0 0 ${({ theme }) => theme.space[2]};
  line-height: 1.15;
  text-align: center;
`;

export const Meta = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.color.fg[3]};
  font-family: ${({ theme }) => theme.font.mono};
  text-align: center;
  margin-bottom: ${({ theme }) => theme.space[8]};
`;

export const Grid = styled.div`
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: ${({ theme }) => theme.space[6]};
  align-items: stretch;
  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

export const Panel = styled.div`
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.xl};
  padding: ${({ theme }) => `${theme.space[6]} ${theme.space[6]}`};
  box-shadow: ${({ theme }) => theme.shadow.lg};
`;

export const OverallRow = styled.div`
  margin-bottom: ${({ theme }) => theme.space[5]};
`;

export const OverallHead = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: ${({ theme }) => theme.space[2]};
`;

export const OverallLabel = styled.div`
  font-size: 12px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[3]};
  letter-spacing: 0.06em;
  text-transform: uppercase;
`;

export const OverallPct = styled.div<{ $done: boolean }>`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 13px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme, $done }) => ($done ? theme.color.success[500] : theme.color.indigo[600])};
`;

export const OverallTrack = styled.div`
  height: 6px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.ink[100]};
  overflow: hidden;
  position: relative;
`;

export const OverallFill = styled.div<{ $pct: number; $done: boolean }>`
  position: absolute;
  inset: 0;
  width: ${({ $pct }) => `${$pct}%`};
  background: ${({ theme, $done }) =>
    $done
      ? `linear-gradient(90deg, ${theme.color.success[500]}, ${theme.color.success[700]})`
      : `linear-gradient(90deg, ${theme.color.indigo[500]}, ${theme.color.indigo[600]})`};
  border-radius: ${({ theme }) => theme.radius.pill};
  transition: width 200ms linear;
`;

export const OverallShine = styled.div<{ $pct: number }>`
  position: absolute;
  top: 0;
  bottom: 0;
  width: 40px;
  left: ${({ $pct }) => `calc(${$pct}% - 40px)`};
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.65), transparent);
  animation: ${shine} 1.6s linear infinite;
`;

export const StepItem = styled.li<{ $state: 'done' | 'active' | 'pending' }>`
  display: flex;
  gap: ${({ theme }) => theme.space[4]};
  align-items: flex-start;
  padding: ${({ theme }) => `${theme.space[3]} 0`};
  border-bottom: 1px dashed ${({ theme }) => theme.color.border[1]};
  opacity: ${({ $state }) => ($state === 'pending' ? 0.55 : 1)};
  transition: opacity 220ms ease;
  &:last-child {
    border-bottom: none;
  }
`;

export const StepList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

export const StepDot = styled.div<{ $state: 'done' | 'active' | 'pending' }>`
  width: 34px;
  height: 34px;
  border-radius: ${({ theme }) => theme.radius.pill};
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  background: ${({ theme, $state }) =>
    $state === 'done'
      ? theme.color.success[50]
      : $state === 'active'
        ? theme.color.indigo[50]
        : theme.color.bg.sunken};
  border: 1.5px solid
    ${({ theme, $state }) =>
      $state === 'done'
        ? theme.color.success[500]
        : $state === 'active'
          ? theme.color.indigo[600]
          : theme.color.border[1]};
  color: ${({ theme, $state }) =>
    $state === 'done'
      ? theme.color.success[500]
      : $state === 'active'
        ? theme.color.indigo[600]
        : theme.color.fg[4]};

  ${({ $state }) =>
    $state === 'active' &&
    css`
      &::after {
        content: '';
        position: absolute;
        inset: -4px;
        border-radius: ${({ theme }) => theme.radius.pill};
        border: 2px solid ${({ theme }) => theme.color.indigo[600]};
        opacity: 0.25;
        animation: ${pulseRing} 1.4s ease-out infinite;
      }
    `}
`;

export const StepBody = styled.div`
  flex: 1;
  min-width: 0;
  padding-top: 4px;
`;

export const StepHead = styled.div`
  display: flex;
  align-items: baseline;
  gap: ${({ theme }) => theme.space[2]};
  flex-wrap: wrap;
`;

export const StepLabel = styled.div`
  font-size: 14px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const StepStateTag = styled.div<{ $tone: 'indigo' | 'success' }>`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme, $tone }) =>
    $tone === 'success' ? theme.color.success[500] : theme.color.indigo[600]};
`;

export const StepDetail = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  margin-top: 2px;
`;

export const Footer = styled.div`
  margin-top: ${({ theme }) => theme.space[4]};
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
`;

export const ErrorBanner = styled.div`
  margin-top: ${({ theme }) => theme.space[5]};
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[4]}`};
  background: ${({ theme }) => theme.color.danger[50]};
  color: ${({ theme }) => theme.color.danger[700]};
  border: 1px solid ${({ theme }) => theme.color.danger[500]};
  border-radius: ${({ theme }) => theme.radius.md};
  font-size: 13px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
`;

export const StagePanel = styled(Panel)`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  min-height: 420px;
`;

export const SignerRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[5]};
  margin-top: ${({ theme }) => theme.space[6]};
`;

export const SignerTile = styled.div<{ $delivered: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]};
  opacity: ${({ $delivered }) => ($delivered ? 1 : 0.4)};
  transform: ${({ $delivered }) => ($delivered ? 'translateY(0)' : 'translateY(8px)')};
  transition:
    transform 360ms cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 360ms;
`;

export const SignerAvatar = styled.div<{ $delivered: boolean }>`
  width: 38px;
  height: 38px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.indigo[600]};
  color: ${({ theme }) => theme.color.bg.surface};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  border: 2px solid
    ${({ theme, $delivered }) => ($delivered ? theme.color.success[500] : theme.color.border[1])};
  box-shadow: ${({ $delivered }) => ($delivered ? '0 0 0 4px rgba(16, 185, 129, 0.18)' : 'none')};
  transition:
    box-shadow 280ms ease,
    border-color 280ms ease;
  position: relative;
`;

export const SignerFirstName = styled.div`
  font-size: 10px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const StatusLine = styled.div`
  margin-top: auto;
  padding-top: ${({ theme }) => theme.space[4]};
  font-size: 13px;
  color: ${({ theme }) => theme.color.fg[3]};
  font-family: ${({ theme }) => theme.font.mono};
  text-align: center;
`;
