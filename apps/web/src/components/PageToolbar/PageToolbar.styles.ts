import styled from 'styled-components';

/**
 * Canvas `.canvas-toolbar`: pages, zoom, undo / redo, help, in a 4px-padded
 * pill of 32px ghost buttons with 13px medium labels.
 */
export const Root = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space[1]};
  padding: ${({ theme }) => theme.space[1]};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[2]};
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.pill};
  box-shadow: ${({ theme }) => theme.shadow.md};
`;

export const IconButton = styled.button`
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: transparent;
  border: 1px solid transparent;
  border-radius: ${({ theme }) => theme.radius.sm};
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
  height: 20px;
  background: ${({ theme }) => theme.color.border[1]};
`;

/** Canvas `.meta` label: 13px, tabular figures. */
export const PageIndicator = styled.span`
  padding: 0 6px;
  font-size: ${({ theme }) => theme.font.size.caption};
  line-height: 1.5;
  color: ${({ theme }) => theme.color.fg[3]};
  font-variant-numeric: tabular-nums;
  text-align: center;
  white-space: nowrap;
`;

/**
 * Zoom-percentage chip — behaves like a button when `onResetZoom` is wired so
 * users can click it to snap back to 100%.
 */
export const ZoomPercent = styled.button`
  font-family: inherit;
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[3]};
  height: 32px;
  padding: 0 6px;
  font-variant-numeric: tabular-nums;
  text-align: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: ${({ theme }) => theme.radius.sm};
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
