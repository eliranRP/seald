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
  transition: ${({ $isDragging }) => ($isDragging ? 'none' : 'opacity 120ms, box-shadow 120ms')};

  /* Hover state: subtle indigo ring when the field is NOT selected. The
     selected halo replaces this treatment. */
  &:hover {
    box-shadow: ${({ $selected, theme }) =>
      $selected ? 'none' : `0 0 0 1.5px ${theme.color.indigo[300]}`};
  }
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

/**
 * Two-state toggle for the field's `required` flag. Filled indigo when ON,
 * outlined (neutral) when OFF. Rendered in the overlay alongside Copy/Delete.
 */
export const RequiredToggle = styled.button<{ readonly $on: boolean }>`
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 1.5px solid ${({ $on, theme }) => ($on ? theme.color.indigo[600] : theme.color.border[2])};
  background: ${({ $on, theme }) => ($on ? theme.color.indigo[600] : theme.color.bg.surface)};
  color: ${({ $on, theme }) => ($on ? theme.color.fg.inverse : theme.color.fg[2])};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: ${({ theme }) => theme.shadow.sm};
  appearance: none;
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

/**
 * Always-visible "required" mark shown at the top-right of each tile while the
 * field is required — so users can see at a glance which fields are required
 * without having to select them first.
 */
export const RequiredBadge = styled.span`
  position: absolute;
  top: -5px;
  left: -5px;
  width: 14px;
  height: 14px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.danger[500]};
  color: ${({ theme }) => theme.color.fg.inverse};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
`;

export const Halo = styled.div`
  position: absolute;
  inset: -4px;
  border: 1.5px solid ${({ theme }) => theme.color.indigo[500]};
  border-radius: ${({ theme }) => theme.radius.sm};
  pointer-events: none;
`;

export const ResizeHandle = styled.button<{
  readonly $top: 'start' | 'end';
  readonly $left: 'start' | 'end';
}>`
  position: absolute;
  width: 12px;
  height: 12px;
  padding: 0;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1.5px solid ${({ theme }) => theme.color.indigo[500]};
  appearance: none;
  cursor: ${({ $top, $left }) => {
    const diagonal = ($top === 'start' && $left === 'start') || ($top === 'end' && $left === 'end');
    return diagonal ? 'nwse-resize' : 'nesw-resize';
  }};
  z-index: 6;
  ${({ $top }) =>
    $top === 'start'
      ? css`
          top: -6px;
        `
      : css`
          bottom: -6px;
        `}
  ${({ $left }) =>
    $left === 'start'
      ? css`
          left: -6px;
        `
      : css`
          right: -6px;
        `}
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
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
