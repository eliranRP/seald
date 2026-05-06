import styled, { css, keyframes } from 'styled-components';

/* ---- Keyframe animations (matching SendingOverlay specs) ---- */

export const scanBeam = keyframes`
  0%   { top: 8px; opacity: 0; }
  10%  { opacity: 1; }
  90%  { opacity: 1; }
  100% { top: 130px; opacity: 0; }
`;

export const shimmer = keyframes`
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(200%); }
`;

export const pulseRing = keyframes`
  0%   { transform: scale(0.9); opacity: 0.5; }
  100% { transform: scale(1.4); opacity: 0; }
`;

export const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
`;

export const checkPop = keyframes`
  0%   { transform: scale(0); }
  60%  { transform: scale(1.15); }
  100% { transform: scale(1); }
`;

export const driveFloat = keyframes`
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-4px); }
`;

export const arrowFlow = keyframes`
  0%   { opacity: 0; transform: translateX(-8px); }
  50%  { opacity: 1; }
  100% { opacity: 0; transform: translateX(8px); }
`;

/* ---- Reduced-motion mixin ---- */

const reducedMotion = css`
  @media (prefers-reduced-motion: reduce) {
    animation: none !important;
    transition: none !important;
  }
`;

/* ---- Overlay root ---- */

export const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 120;
  background: radial-gradient(
    1200px 600px at 50% -10%,
    ${({ theme }) => theme.color.indigo[50]} 0%,
    ${({ theme }) => theme.color.bg.app} 55%
  );
  display: flex;
  align-items: center;
  justify-content: center;
  animation: ${fadeUp} 300ms ease;
  ${reducedMotion}
`;

export const Card = styled.div`
  text-align: center;
  max-width: 380px;
  padding: 40px 32px;
`;

/* ---- Visual: Drive icon -> arrows -> PDF ---- */

export const Visual = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-bottom: 32px;
  height: 120px;
`;

export const DriveIconBox = styled.div`
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: ${({ theme }) => theme.shadow.sm};
  animation: ${driveFloat} 2s ease-in-out infinite;
  ${reducedMotion}
`;

export const FlowArrows = styled.div`
  display: flex;
  gap: 2px;
`;

export const FlowArrow = styled.div<{ readonly $delay: number }>`
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: ${({ theme }) => theme.color.indigo[400]};
  animation: ${arrowFlow} 1.2s ease-in-out infinite;
  animation-delay: ${({ $delay }) => $delay}s;
  ${reducedMotion}
`;

export const PdfDoc = styled.div`
  width: 64px;
  height: 84px;
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: 6px;
  box-shadow: ${({ theme }) => theme.shadow.sm};
  position: relative;
  overflow: hidden;
`;

export const ScanLine = styled.div`
  position: absolute;
  left: 6px;
  right: 6px;
  height: 2px;
  background: linear-gradient(
    90deg,
    transparent,
    ${({ theme }) => theme.color.indigo[500]},
    transparent
  );
  border-radius: 1px;
  box-shadow: 0 0 8px ${({ theme }) => theme.color.indigo[400]};
  animation: ${scanBeam} 1.1s ease-in-out infinite;
  ${reducedMotion}
`;

export const PdfLine = styled.div<{ readonly $short?: boolean }>`
  height: 3px;
  background: ${({ theme }) => theme.color.ink[100]};
  border-radius: 1px;
  margin: 6px 8px 0;
  width: ${({ $short }) => ($short ? '60%' : 'auto')};

  &:first-of-type {
    margin-top: 10px;
  }
`;

/* ---- Title / subtitle ---- */

export const ImportTitle = styled.h2`
  font-size: 18px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  margin: 0 0 4px;
  font-family: ${({ theme }) => theme.font.sans};
`;

export const ImportSub = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.color.fg[3]};
  margin: 0 0 24px;
`;

/* ---- Progress bar ---- */

export const ProgressTrack = styled.div`
  width: 100%;
  height: 6px;
  background: ${({ theme }) => theme.color.ink[100]};
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: 24px;
`;

export const ProgressFill = styled.div<{ readonly $pct: number }>`
  height: 100%;
  background: ${({ theme }) => theme.color.indigo[600]};
  border-radius: 999px;
  position: relative;
  overflow: hidden;
  width: ${({ $pct }) => $pct}%;
  transition: width 400ms ease;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
    animation: ${shimmer} 1.6s linear infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
    &::after {
      animation: none;
    }
  }
`;

/* ---- Step checklist ---- */

export const Steps = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  text-align: left;
`;

type StepState = 'pending' | 'active' | 'done';

export const Step = styled.div<{ readonly $state: StepState; readonly $delay: number }>`
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: ${({ theme, $state }) =>
    $state === 'active' ? theme.font.weight.semibold : theme.font.weight.medium};
  color: ${({ theme, $state }) => {
    if ($state === 'active') return theme.color.fg[1];
    if ($state === 'done') return theme.color.success[700];
    return theme.color.fg[3];
  }};
  animation: ${fadeUp} 300ms ease both;
  animation-delay: ${({ $delay }) => $delay}ms;
  ${reducedMotion}
`;

export const StepDot = styled.div<{ readonly $state: StepState }>`
  width: 22px;
  height: 22px;
  border-radius: 999px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  background: ${({ theme, $state }) => {
    if ($state === 'active') return theme.color.indigo[600];
    if ($state === 'done') return theme.color.success[500];
    return theme.color.ink[100];
  }};

  ${({ $state }) =>
    $state === 'active' &&
    css`
      &::after {
        content: '';
        position: absolute;
        inset: -4px;
        border: 2px solid ${({ theme }) => theme.color.indigo[400]};
        border-radius: 999px;
        animation: ${pulseRing} 1.4s ease-out infinite;

        @media (prefers-reduced-motion: reduce) {
          animation: none;
          opacity: 0.3;
        }
      }
    `}

  ${({ $state }) =>
    $state === 'done' &&
    css`
      animation: ${checkPop} 300ms ease both;

      @media (prefers-reduced-motion: reduce) {
        animation: none;
      }
    `}
`;

export const InnerDot = styled.div`
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #fff;
`;

/* ---- Done state ---- */

export const DoneCheck = styled.div`
  width: 56px;
  height: 56px;
  border-radius: 999px;
  background: ${({ theme }) => theme.color.success[500]};
  margin: 0 auto 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  animation: ${checkPop} 400ms cubic-bezier(0.5, 1.8, 0.5, 1);
  ${reducedMotion}
`;
