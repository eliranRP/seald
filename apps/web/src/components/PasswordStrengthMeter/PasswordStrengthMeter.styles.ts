import styled, { css, type DefaultTheme } from 'styled-components';
import type { PasswordStrength } from './PasswordStrengthMeter.types';

const filledColor = (t: DefaultTheme, level: PasswordStrength) => {
  switch (level) {
    case 1:
      return t.color.danger[500];
    case 2:
      return t.color.warn[500];
    case 3:
      return t.color.indigo[500];
    case 4:
      return t.color.success[500];
    case 0:
    default:
      return t.color.ink[150];
  }
};

export const Root = styled.div`
  display: flex;
  flex-direction: column;
`;

export const BarRow = styled.div`
  display: flex;
  flex-direction: row;
  gap: ${({ theme }) => theme.space[1]};
  width: 100%;
`;

export const Bar = styled.span<{ $filled: boolean; $level: PasswordStrength }>`
  flex: 1;
  height: 4px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme, $filled, $level }) =>
    $filled ? filledColor(theme, $level) : theme.color.ink[150]};
  transition: background ${({ theme }) => theme.motion.durFast}
    ${({ theme }) => theme.motion.easeStandard};
  ${({ $filled }) =>
    !$filled &&
    css`
      opacity: 1;
    `}
`;

export const Label = styled.span`
  margin-top: ${({ theme }) => theme.space[2]};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
  line-height: ${({ theme }) => theme.font.lineHeight.snug};
`;
