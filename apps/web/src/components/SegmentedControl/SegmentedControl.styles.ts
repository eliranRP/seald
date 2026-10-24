import styled, { css } from 'styled-components';

export const SegmentedRoot = styled.div<{ $block: boolean }>`
  display: ${({ $block }) => ($block ? 'flex' : 'inline-flex')};
  width: ${({ $block }) => ($block ? '100%' : 'auto')};
  gap: 4px;
  padding: 4px;
  background: ${({ theme }) => theme.color.ink[100]};
  border-radius: ${({ theme }) => theme.radius.md};
`;

export const Segment = styled.button<{ $active: boolean; $block: boolean; $stacked: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 40px;
  padding: 0 14px;
  border: 0;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: transparent;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[2]};
  cursor: pointer;
  transition:
    background-color ${({ theme }) => theme.motion.durFast}
      ${({ theme }) => theme.motion.easeStandard},
    color ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard},
    box-shadow ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard};
  ${({ $block }) =>
    $block &&
    css`
      flex: 1;
    `}
  ${({ $stacked, theme }) =>
    $stacked &&
    css`
      flex-direction: column;
      height: 56px;
      gap: 4px;
      font-size: ${theme.font.size.xs};
    `}
  ${({ $active, theme }) =>
    $active &&
    css`
      background: ${theme.color.paper};
      color: ${theme.color.fg[1]};
      font-weight: ${theme.font.weight.semibold};
      box-shadow: ${theme.shadow.sm};
    `}
  &:focus-visible {
    outline: 0;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
