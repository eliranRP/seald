import styled from 'styled-components';

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

export const Workspace = styled.div`
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  background: ${({ theme }) => theme.color.ink[50]};
  user-select: none;
`;

export const Center = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
  padding: ${({ theme }) => theme.space[6]} 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};
`;

export const CenterHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  max-width: 780px;
  padding: 0 ${({ theme }) => theme.space[6]};
`;

export const CenterHeaderSide = styled.div`
  min-width: 68px;
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
`;

export const RightRailInner = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

export const RightRailScroll = styled.div`
  flex: 1 1 auto;
  overflow: auto;
  padding: ${({ theme }) => theme.space[4]};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
`;

export const RightRailFooter = styled.div`
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
`;

export const CanvasWrap = styled.div`
  position: relative;
`;

export const MarqueeRect = styled.div`
  position: absolute;
  pointer-events: none;
  border: 1px solid ${({ theme }) => theme.color.indigo[500]};
  background: ${({ theme }) => theme.color.indigo[100]};
  opacity: 0.35;
  border-radius: ${({ theme }) => theme.radius.sm};
  z-index: 1;
`;

/**
 * Floating toolbar shown above the bounding box of a multi-field selection.
 * Lets the user duplicate or delete every selected field at once instead of
 * having to do it one field at a time.
 */
export const GroupToolbar = styled.div`
  position: absolute;
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]};
  padding: 4px;
  background: ${({ theme }) => theme.color.ink[900]};
  border-radius: ${({ theme }) => theme.radius.sm};
  box-shadow: ${({ theme }) => theme.shadow.md};
  z-index: 6;
`;

export const GroupToolbarLabel = styled.span`
  padding: 0 ${({ theme }) => theme.space[2]};
  color: ${({ theme }) => theme.color.fg.inverse};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
`;

export const GroupToolbarButton = styled.button<{ readonly $tone: 'indigo' | 'danger' }>`
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 6px;
  background: ${({ $tone, theme }) =>
    $tone === 'danger' ? theme.color.danger[500] : theme.color.indigo[600]};
  color: ${({ theme }) => theme.color.fg.inverse};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  appearance: none;
  &:hover {
    filter: brightness(1.08);
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;
