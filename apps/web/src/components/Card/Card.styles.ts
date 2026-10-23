import styled, { css } from 'styled-components';
import { hoverLift } from '@/styles/motion';
import type { SealdTheme } from '@/styles/theme';

export const CardRoot = styled.div<{
  $elevated: boolean;
  $padding: keyof SealdTheme['space'];
  $interactive: boolean;
}>`
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  padding: ${({ theme, $padding }) => theme.space[$padding]};
  box-shadow: ${({ theme, $elevated }) => ($elevated ? theme.shadow.md : 'none')};
  ${({ $interactive }) =>
    $interactive &&
    css`
      cursor: pointer;
      ${hoverLift}
    `}
`;
