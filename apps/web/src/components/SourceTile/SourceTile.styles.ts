import styled from 'styled-components';
import { pressable } from '@/styles/motion';

export const Tile = styled.button<{ $selected: boolean; $stacked: boolean }>`
  display: flex;
  flex-direction: ${({ $stacked }) => ($stacked ? 'column' : 'row')};
  align-items: center;
  gap: ${({ theme, $stacked }) => ($stacked ? theme.space[2] : theme.space[3])};
  width: 100%;
  padding: ${({ theme, $stacked }) =>
    $stacked ? `${theme.space[3]} ${theme.space[2]}` : theme.space[4]};
  border-radius: ${({ theme }) => theme.radius.lg};
  border: ${({ $selected }) => ($selected ? '1.5px' : '1px')} solid
    ${({ theme, $selected }) => ($selected ? theme.color.indigo[600] : theme.color.border[1])};
  background: ${({ theme, $selected }) => ($selected ? theme.color.indigo[50] : theme.color.paper)};
  text-align: ${({ $stacked }) => ($stacked ? 'center' : 'left')};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme, $stacked }) =>
    $stacked ? theme.font.size.caption : theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  cursor: pointer;
  ${pressable}

  &:hover {
    border-color: ${({ theme, $selected }) =>
      $selected ? theme.color.indigo[600] : theme.color.border[2]};
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const IconCircle = styled.span<{ $selected: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: ${({ theme, $selected }) =>
    $selected ? theme.color.indigo[600] : theme.color.ink[100]};
  color: ${({ theme, $selected }) => ($selected ? theme.color.fgOnAccent : theme.color.fg[2])};
`;

export const Text = styled.span`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

export const Meta = styled.span`
  font-size: ${({ theme }) => theme.font.size.xs};
  font-weight: ${({ theme }) => theme.font.weight.regular};
  color: ${({ theme }) => theme.color.fg[3]};
`;
