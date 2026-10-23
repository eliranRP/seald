import styled, { css } from 'styled-components';
import { toastIn } from '@/styles/motion';
import type { ToastTone } from './Toast.types';

export const Wrap = styled.div<{ $placement: 'fixed' | 'inline' }>`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  max-width: min(560px, calc(100vw - 32px));
  padding: 12px 16px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.ink[900]};
  color: ${({ theme }) => theme.color.fgOnAccent};
  box-shadow: ${({ theme }) => theme.shadow.lg};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  ${toastIn}
  ${({ $placement, theme }) =>
    $placement === 'fixed' &&
    css`
      position: fixed;
      left: 50%;
      bottom: 32px;
      transform: translateX(-50%);
      z-index: ${theme.z.toast};
      @media (max-width: 640px) {
        left: 16px;
        right: 16px;
        bottom: calc(96px + env(safe-area-inset-bottom));
        transform: none;
        max-width: none;
      }
    `}
`;

export const IconSlot = styled.span<{ $tone: ToastTone }>`
  display: inline-flex;
  flex: none;
  color: ${({ theme, $tone }) => {
    if ($tone === 'success') return theme.color.success[400];
    if ($tone === 'error') return theme.color.danger[200];
    return theme.color.indigo[200];
  }};
`;

export const Body = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
`;

export const Title = styled.div`
  color: ${({ theme }) => theme.color.fgOnAccent};
`;

export const Subtitle = styled.div`
  margin-top: 2px;
  font-size: ${({ theme }) => theme.font.size.xs};
  font-weight: ${({ theme }) => theme.font.weight.regular};
  color: ${({ theme }) => theme.color.ink[300]};
`;

export const Sep = styled.span`
  flex: none;
  width: 1px;
  height: 20px;
  background: rgba(255, 255, 255, 0.24);
`;

export const ToastButton = styled.button<{ $icon?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  height: 32px;
  min-width: 32px;
  padding: ${({ $icon }) => ($icon ? '0' : '0 12px')};
  border: 0;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: transparent;
  color: ${({ theme }) => theme.color.fgOnAccent};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;
  transition: background-color ${({ theme }) => theme.motion.durFast}
    ${({ theme }) => theme.motion.easeStandard};
  &:hover {
    background: rgba(255, 255, 255, 0.12);
  }
  &:focus-visible {
    outline: 0;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;
