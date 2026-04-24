import styled from 'styled-components';
import type { DefaultTheme } from 'styled-components';
import type { ProgressBarTone } from './ProgressBar.types';

const toneColor = (t: DefaultTheme, tone: ProgressBarTone) => {
  switch (tone) {
    case 'success':
      return t.color.success[500];
    case 'indigo':
    default:
      return t.color.indigo[600];
  }
};

export const Track = styled.div`
  width: 100%;
  height: 6px;
  background: ${({ theme }) => theme.color.ink[100]};
  border-radius: ${({ theme }) => theme.radius.pill};
  overflow: hidden;
`;

export const Filled = styled.div<{ $pct: number; $tone: ProgressBarTone }>`
  height: 100%;
  width: ${({ $pct }) => `${$pct}%`};
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme, $tone }) => toneColor(theme, $tone)};
  transition: width 240ms ease;
`;
