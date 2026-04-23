import styled, { css } from 'styled-components';
import type { CollapsibleRailSide } from './CollapsibleRail.types';

type SideProps = { readonly $side: CollapsibleRailSide };
type SideDraggingProps = SideProps & { readonly $dragging: boolean };
type OpenWidthProps = SideProps & { readonly $width: number };

const edgeBorder = css<SideProps>`
  ${({ $side, theme }) =>
    $side === 'left'
      ? css`
          border-right: 1px solid ${theme.color.border[1]};
        `
      : css`
          border-left: 1px solid ${theme.color.border[1]};
        `}
`;

export const CollapsedRoot = styled.aside<SideProps>`
  width: 40px;
  background: ${({ theme }) => theme.color.bg.surface};
  ${edgeBorder};
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: ${({ theme }) => `${theme.space[3]} 0`};
  flex-shrink: 0;
`;

export const CollapsedToggle = styled.button`
  appearance: none;
  width: 28px;
  height: 28px;
  border-radius: ${({ theme }) => theme.radius.sm};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  background: ${({ theme }) => theme.color.bg.surface};
  color: ${({ theme }) => theme.color.fg[2]};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const VerticalTitle = styled.div`
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.micro};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.fg[3]};
  margin-top: ${({ theme }) => theme.space[4]};
`;

export const OpenRoot = styled.aside<OpenWidthProps>`
  width: ${({ $width }) => `${$width}px`};
  background: ${({ theme }) => theme.color.bg.surface};
  ${edgeBorder};
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  position: relative;
  overflow: hidden;
`;

export const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[4]}`};
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
`;

export const TitleText = styled.div`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h5};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const HeaderToggle = styled.button`
  appearance: none;
  border: none;
  background: transparent;
  padding: ${({ theme }) => theme.space[1]};
  border-radius: ${({ theme }) => theme.radius.xs};
  cursor: pointer;
  color: ${({ theme }) => theme.color.fg[3]};
  display: inline-flex;
  align-items: center;
  &:hover {
    color: ${({ theme }) => theme.color.fg[1]};
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const Body = styled.div<{ readonly $noPad: boolean }>`
  flex: 1;
  overflow: auto;
  padding: ${({ $noPad, theme }) => ($noPad ? '0' : `${theme.space[3]} ${theme.space[4]}`)};
`;

export const ResizeHandle = styled.div<SideDraggingProps>`
  position: absolute;
  top: 0;
  bottom: 0;
  ${({ $side }) =>
    $side === 'left'
      ? css`
          right: -3px;
        `
      : css`
          left: -3px;
        `}
  width: 6px;
  cursor: col-resize;
  z-index: 5;
`;

export const ResizeGrip = styled.div<{ readonly $dragging: boolean }>`
  position: absolute;
  top: 50%;
  left: 2px;
  transform: translateY(-50%);
  width: 2px;
  height: 32px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ $dragging, theme }) => ($dragging ? theme.color.indigo[500] : 'transparent')};
`;
