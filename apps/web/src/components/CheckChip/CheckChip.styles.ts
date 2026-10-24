import styled, { type DefaultTheme } from 'styled-components';
import { visuallyHidden } from '@/styles/mixins';
import { rise, stagger } from '@/styles/motion';
import type { CheckChipState } from './CheckChip.types';

const stateColors = (t: DefaultTheme, state: CheckChipState) =>
  ({
    ok: { bg: t.color.success[50], fg: t.color.success[700] },
    bad: { bg: t.color.danger[50], fg: t.color.danger[700] },
    off: { bg: t.color.ink[100], fg: t.color.fg[3] },
  })[state];

export const CheckChipRoot = styled.span<{
  $state: CheckChipState;
  $index: number;
  $large: boolean;
}>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme, $state }) => stateColors(theme, $state).bg};
  color: ${({ theme, $state }) => stateColors(theme, $state).fg};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  white-space: nowrap;
  ${({ $large, theme }) =>
    $large
      ? `
    height: 36px;
    padding: 0 14px;
    font-size: ${theme.font.size.bodyMd};

    @media (max-width: 640px) {
      height: 40px;
    }
  `
      : ''}
  ${rise}
  ${({ $index }) => stagger($index)}
`;

export const HiddenState = styled.span`
  ${visuallyHidden}
`;
