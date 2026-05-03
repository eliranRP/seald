import styled, { keyframes } from 'styled-components';

/**
 * Shared modal chrome for the WT-E Drive import dialogs (progress + failed).
 * Mirrors `ExitConfirmDialog.styles.ts` so the visual contract is identical
 * — every dialog in the app uses the same backdrop opacity, card radius,
 * and footer button alignment.
 */
export const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(11, 18, 32, 0.48);
  z-index: ${({ theme }) => theme.z.modal};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.space[5]};
`;

export const Card = styled.div`
  background: ${({ theme }) => theme.color.bg.surface};
  border-radius: ${({ theme }) => theme.radius.xl};
  box-shadow: ${({ theme }) => theme.shadow.xl};
  padding: ${({ theme }) => theme.space[6]};
  width: 100%;
  max-width: 460px;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
`;

export const Title = styled.h2`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h4};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Description = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.body};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.space[2]};
`;

const slideRight = keyframes`
  0%   { transform: translateX(-30%); }
  100% { transform: translateX(130%); }
`;

/**
 * Indeterminate progress bar — a visual placeholder that loops a slim
 * indigo block across the track. We deliberately do NOT set
 * `aria-valuenow` (the bar is indeterminate per ARIA 1.2 §5.4) so
 * assistive tech announces the busy state without a fake percentage.
 */
export const IndeterminateBar = styled.div`
  position: relative;
  height: 6px;
  border-radius: 999px;
  background: ${({ theme }) => theme.color.bg.subtle};
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 30%;
    height: 100%;
    border-radius: 999px;
    background: ${({ theme }) => theme.color.indigo[600]};
    animation: ${slideRight} 1.4s ease-in-out infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    &::before {
      animation: none;
      width: 100%;
      opacity: 0.6;
    }
  }
`;

export const FileNameRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  padding: ${({ theme }) => theme.space[3]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.bg.subtle};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[2]};
  word-break: break-word;
`;
