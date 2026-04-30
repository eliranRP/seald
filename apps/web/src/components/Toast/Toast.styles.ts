import styled, { css, keyframes } from 'styled-components';
import type { ToastTone } from './Toast.types';

const toastIn = keyframes`
  from { opacity: 0; transform: translate(-50%, -8px); }
  to   { opacity: 1; transform: translate(-50%, 0); }
`;

/**
 * Top-center floating toast. Z-index above the editor backdrop but
 * below modal dialogs so a pending dialog continues to read first.
 * Position is `fixed` so the toast tracks scroll on long pages.
 */
export const Wrap = styled.div`
  position: fixed;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: 14px;
  padding: 14px 20px;
  box-shadow: ${({ theme }) => theme.shadow.lg};
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: ${({ theme }) => theme.color.fg[1]};
  font-family: ${({ theme }) => theme.font.sans};
  animation: ${toastIn} 240ms ease-out;
  max-width: 460px;
`;

export const IconBadge = styled.span<{ $tone: ToastTone }>`
  width: 24px;
  height: 24px;
  border-radius: ${({ theme }) => theme.radius.pill};
  color: ${({ theme }) => theme.color.fg.inverse};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  ${({ $tone, theme }) => {
    if ($tone === 'success') {
      return css`
        background: ${theme.color.success[500]};
      `;
    }
    if ($tone === 'error') {
      return css`
        background: ${theme.color.danger[500]};
      `;
    }
    return css`
      background: ${theme.color.indigo[500]};
    `;
  }}
`;

export const Body = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

export const Title = styled.div`
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Subtitle = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  margin-top: 2px;
`;
