import styled, { css, keyframes, type DefaultTheme } from 'styled-components';

function loaderStepDotBg(theme: DefaultTheme, done: boolean, active: boolean): string {
  if (done) return theme.color.success[500];
  if (active) return theme.color.indigo[600];
  return theme.color.ink[200];
}

export const Shell = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: ${({ theme }) => theme.color.bg.app};
  font-family: ${({ theme }) => theme.font.sans};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Body = styled.div`
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
`;

export const Main = styled.main`
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
  padding: ${({ theme }) => theme.space[12]} ${({ theme }) => theme.space[12]}
    ${({ theme }) => theme.space[20]};
`;

export const Inner = styled.div`
  max-width: 960px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[8]};
`;

export const Heading = styled.h1`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h1};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  letter-spacing: ${({ theme }) => theme.font.tracking.tight};
  line-height: ${({ theme }) => theme.font.lineHeight.tight};
  color: ${({ theme }) => theme.color.fg[1]};
  margin: 0;
`;

export const Subtitle = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.body};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  color: ${({ theme }) => theme.color.fg[3]};
  max-width: 58ch;
`;

export const Dropzone = styled.div<{ readonly $dragging: boolean }>`
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1.5px dashed ${({ theme }) => theme.color.indigo[300]};
  border-radius: ${({ theme }) => theme.radius['2xl']};
  padding: ${({ theme }) => theme.space[16]} ${({ theme }) => theme.space[8]};
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[5]};
  transition:
    background ${({ theme }) => theme.motion.durBase} ${({ theme }) => theme.motion.easeStandard},
    border-color ${({ theme }) => theme.motion.durBase} ${({ theme }) => theme.motion.easeStandard};

  ${({ $dragging, theme }) =>
    $dragging &&
    css`
      background: ${theme.color.indigo[50]};
      border-color: ${theme.color.indigo[500]};
    `}

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const IconCircle = styled.div`
  width: 64px;
  height: 64px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.indigo[50]};
  color: ${({ theme }) => theme.color.indigo[600]};
  display: inline-flex;
  align-items: center;
  justify-content: center;
`;

export const DropHeading = styled.div`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h3};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const DropSubheading = styled.div`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Actions = styled.div`
  display: inline-flex;
  gap: ${({ theme }) => theme.space[3]};
  margin-top: ${({ theme }) => theme.space[3]};
`;

export const HiddenFileInput = styled.input`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

export const ErrorText = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.danger[700]};
`;

/* ---- Analyzing loader ------------------------------------------------ */

export const scan = keyframes`
  0%   { top: 10px; opacity: 0; }
  10%  { opacity: 1; }
  90%  { opacity: 1; }
  100% { top: calc(100% - 10px); opacity: 0; }
`;

export const stepPulse = keyframes`
  0%, 100% { opacity: 0.55; transform: translateY(0); }
  50%      { opacity: 1;    transform: translateY(-1px); }
`;

export const shine = keyframes`
  0%   { background-position: -120% 0; }
  100% { background-position: 220% 0; }
`;

export const LoaderCard = styled.div`
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius['2xl']};
  padding: ${({ theme }) => `${theme.space[12]} ${theme.space[8]} ${theme.space[8]}`};
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[5]};
  box-shadow: ${({ theme }) => theme.shadow.md};
`;

export const LoaderPage = styled.div`
  position: relative;
  width: 140px;
  height: 180px;
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.sm};
  padding: 14px 12px;
  box-sizing: border-box;
  box-shadow: ${({ theme }) => theme.shadow.md};
  overflow: hidden;
`;

export const LoaderLine = styled.div<{ $width: string }>`
  height: 2px;
  width: ${({ $width }) => $width};
  background: ${({ theme }) => theme.color.ink[100]};
  border-radius: 1px;
  margin: 5px 0;
  &:nth-child(1) {
    background: ${({ theme }) => theme.color.ink[200]};
  }
`;

export const LoaderScan = styled.div`
  position: absolute;
  left: 8px;
  right: 8px;
  height: 2px;
  border-radius: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    ${({ theme }) => theme.color.indigo[600]},
    transparent
  );
  box-shadow: 0 0 10px rgba(79, 70, 229, 0.7);
  animation: ${scan} 1.1s ease-in-out infinite;
`;

export const LoaderTitle = styled.div`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h3};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  text-align: center;
`;

export const LoaderSubtitle = styled.div`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[3]};
  text-align: center;
  font-family: ${({ theme }) => theme.font.mono};
`;

export const LoaderProgress = styled.div`
  width: 100%;
  height: 4px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.ink[100]};
  overflow: hidden;
  position: relative;
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      ${({ theme }) => theme.color.indigo[600]} 30%,
      ${({ theme }) => theme.color.indigo[600]} 70%,
      transparent 100%
    );
    background-size: 50% 100%;
    background-repeat: no-repeat;
    animation: ${shine} 1.4s linear infinite;
  }
`;

export const LoaderSteps = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
  width: 100%;
`;

export const LoaderStep = styled.li<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme, $active }) => ($active ? theme.color.fg[1] : theme.color.fg[3])};
  padding: ${({ theme }) => `${theme.space[1]} 0`};
  animation: ${({ $active }) => ($active ? stepPulse : 'none')} 1.6s ease-in-out infinite;
`;

export const LoaderStepDot = styled.span<{ $active: boolean; $done: boolean }>`
  width: 10px;
  height: 10px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme, $done, $active }) => loaderStepDotBg(theme, $done, $active)};
  flex-shrink: 0;
  transition: background 200ms ease;
`;

/* ---- Template banner ---- */

export const TemplateBanner = styled.div<{ $tone: 'info' | 'warning' }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[4]}`};
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid
    ${({ theme, $tone }) => ($tone === 'warning' ? theme.color.warn[500] : theme.color.indigo[200])};
  background: ${({ theme, $tone }) =>
    $tone === 'warning' ? theme.color.warn[50] : theme.color.indigo[50]};
  color: ${({ theme, $tone }) =>
    $tone === 'warning' ? theme.color.warn[700] : theme.color.indigo[800]};
  font-size: ${({ theme }) => theme.font.size.bodySm};
`;

export const TemplateBannerText = styled.span`
  flex: 1 1 auto;
  min-width: 0;
`;

export const TemplateBannerStrong = styled.strong`
  font-weight: 600;
`;

export const TemplateBannerClear = styled.button`
  appearance: none;
  background: transparent;
  border: none;
  padding: 0;
  margin: 0;
  font: inherit;
  color: inherit;
  text-decoration: underline;
  cursor: pointer;
  &:hover {
    opacity: 0.85;
  }
  &:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
    border-radius: 2px;
  }
`;
