import styled from 'styled-components';

export const Root = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space[1]};
  padding: ${({ theme }) => `${theme.space[1]} ${theme.space[2]}`};
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.sm};
`;

export const IconButton = styled.button`
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: transparent;
  border: 1px solid transparent;
  border-radius: ${({ theme }) => theme.radius.xs};
  color: ${({ theme }) => theme.color.fg[2]};
  cursor: pointer;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.color.bg.subtle};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const Divider = styled.span`
  width: 1px;
  height: 16px;
  background: ${({ theme }) => theme.color.border[1]};
`;

export const PageIndicator = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.micro};
  color: ${({ theme }) => theme.color.fg[2]};
  min-width: 44px;
  text-align: center;
`;

/**
 * Zoom-percentage chip — behaves like a button when `onResetZoom` is wired so
 * users can click it to snap back to 100%.
 */
export const ZoomPercent = styled.button`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.micro};
  color: ${({ theme }) => theme.color.fg[2]};
  min-width: 48px;
  height: 26px;
  text-align: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: ${({ theme }) => theme.radius.xs};
  cursor: pointer;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.color.bg.subtle};
  }

  &:disabled {
    cursor: default;
  }

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;
