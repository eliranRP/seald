import styled, { css } from 'styled-components';

export const Root = styled.div<{
  readonly $x: number;
  readonly $y: number;
  readonly $width: number;
  readonly $height: number;
  readonly $selected: boolean;
  readonly $isDragging: boolean;
}>`
  position: absolute;
  left: ${({ $x }) => `${$x}px`};
  top: ${({ $y }) => `${$y}px`};
  width: ${({ $width }) => `${$width}px`};
  height: ${({ $height }) => `${$height}px`};
  cursor: ${({ $selected }) => ($selected ? 'grabbing' : 'grab')};
  z-index: ${({ $selected }) => ($selected ? 5 : 2)};
  user-select: none;
  opacity: ${({ $isDragging }) => ($isDragging ? 0.55 : 1)};
  transition: ${({ $isDragging }) => ($isDragging ? 'none' : 'opacity 120ms')};
`;

export const AssignBubble = styled.button`
  position: absolute;
  top: -32px;
  left: 0;
  padding: 5px 10px;
  background: ${({ theme }) => theme.color.ink[900]};
  color: ${({ theme }) => theme.color.fg.inverse};
  border-radius: ${({ theme }) => theme.radius.sm};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  box-shadow: ${({ theme }) => theme.shadow.md};
  white-space: nowrap;
  cursor: pointer;
  border: 0;
  appearance: none;
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const ControlsRight = styled.div`
  position: absolute;
  top: -30px;
  right: 0;
  display: flex;
  gap: 4px;
`;

export const ControlButton = styled.button<{ readonly $tone: 'indigo' | 'danger' }>`
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 0;
  background: ${({ $tone, theme }) =>
    $tone === 'danger' ? theme.color.danger[500] : theme.color.indigo[600]};
  color: ${({ theme }) => theme.color.fg.inverse};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: ${({ theme }) => theme.shadow.md};
  appearance: none;
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const Halo = styled.div`
  position: absolute;
  inset: -4px;
  border: 1.5px solid ${({ theme }) => theme.color.indigo[500]};
  border-radius: ${({ theme }) => theme.radius.sm};
  pointer-events: none;
`;

export const ResizeHandle = styled.div<{
  readonly $top: 'start' | 'end';
  readonly $left: 'start' | 'end';
}>`
  position: absolute;
  width: 10px;
  height: 10px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1.5px solid ${({ theme }) => theme.color.indigo[500]};
  ${({ $top }) =>
    $top === 'start'
      ? css`
          top: -5px;
        `
      : css`
          bottom: -5px;
        `}
  ${({ $left }) =>
    $left === 'start'
      ? css`
          left: -5px;
        `
      : css`
          right: -5px;
        `}
`;

export const GroupOverlay = styled.div`
  position: absolute;
  inset: -3px;
  border: 1.5px dashed ${({ theme }) => theme.color.indigo[500]};
  background: ${({ theme }) => theme.color.indigo[50]};
  opacity: 0.6;
  border-radius: ${({ theme }) => theme.radius.sm};
  pointer-events: none;
`;

export const TileRow = styled.div`
  display: flex;
  gap: 8px;
  width: 100%;
  height: 100%;
`;

export const Tile = styled.div<{
  readonly $bg: string;
  readonly $border: string;
}>`
  flex: 1;
  background: ${({ $bg }) => $bg};
  border: 1.5px solid ${({ $border }) => $border};
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: relative;
  box-sizing: border-box;
  min-width: 0;
`;

export const TileHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.color.fg[1]};
  min-width: 0;
`;

export const TileHeaderLabel = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const TileEyebrow = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 9px;
  color: ${({ theme }) => theme.color.fg[3]};
  letter-spacing: 0.04em;
`;

export const InitialsBadge = styled.span<{ readonly $color: string }>`
  position: absolute;
  top: -6px;
  right: -6px;
  width: 16px;
  height: 16px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ $color }) => $color};
  color: ${({ theme }) => theme.color.fg.inverse};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 9px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
`;
