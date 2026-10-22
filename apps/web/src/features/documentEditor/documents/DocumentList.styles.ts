import styled from 'styled-components';
import type { DefaultTheme } from 'styled-components';

export const Root = styled.section`
  display: block;
  width: 100%;
`;

export const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.space[2]};
`;

export const Title = styled.h2`
  margin: 0;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Count = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const List = styled.ol`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
  margin: 0;
  padding: 0;
  list-style: none;
`;

function rowBorder(
  theme: DefaultTheme,
  state: { readonly active: boolean; readonly dropTarget: boolean },
): string {
  if (state.dropTarget) return theme.color.accent.base;
  if (state.active) return theme.color.indigo[300];
  return theme.color.border[1];
}

export const Row = styled.li<{
  readonly $active: boolean;
  readonly $dragging: boolean;
  readonly $dropTarget: boolean;
}>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]};
  padding: 4px 4px 4px 2px;
  border-radius: ${({ theme }) => theme.radius.sm};
  border: 1px solid
    ${({ theme, $active, $dropTarget }) =>
      rowBorder(theme, { active: $active, dropTarget: $dropTarget })};
  background: ${({ theme, $active }) =>
    $active ? theme.color.accent.subtle : theme.color.bg.surface};
  opacity: ${({ $dragging }) => ($dragging ? 0.5 : 1)};
`;

export const Grip = styled.span`
  display: inline-flex;
  flex: none;
  align-items: center;
  color: ${({ theme }) => theme.color.fg[4]};
  cursor: grab;
`;

export const SelectButton = styled.button`
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 4px 6px;
  border: none;
  border-radius: ${({ theme }) => theme.radius.xs};
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const Name = styled.span`
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: 500;
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Meta = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const IconButton = styled.button`
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: ${({ theme }) => theme.radius.xs};
  background: transparent;
  color: ${({ theme }) => theme.color.fg[3]};
  cursor: pointer;
  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.color.bg.subtle};
    color: ${({ theme }) => theme.color.fg[1]};
  }
  &:disabled {
    color: ${({ theme }) => theme.color.fg[4]};
    cursor: not-allowed;
    opacity: 0.5;
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const AddRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[2]};
  margin-top: ${({ theme }) => theme.space[2]};
`;

export const HiddenInput = styled.input`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
`;

export const Notice = styled.p`
  margin: ${({ theme }) => theme.space[2]} 0 0;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.danger[700]};
`;

export const Hint = styled.p`
  margin: ${({ theme }) => theme.space[2]} 0 0;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const VisuallyHidden = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
`;
