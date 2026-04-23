import styled, { type DefaultTheme } from 'styled-components';
import type { AvatarTone } from './Avatar.types';

const toneBg = (t: DefaultTheme, tone: AvatarTone): string =>
  ({
    indigo: t.color.indigo[600],
    emerald: t.color.success[700],
    amber: t.color.warn[700],
    danger: t.color.danger[700],
    slate: t.color.ink[700],
  })[tone];

export const AvatarRoot = styled.div<{ $size: number; $tone: AvatarTone }>`
  width: ${({ $size }) => `${$size}px`};
  height: ${({ $size }) => `${$size}px`};
  background: ${({ theme, $tone }) => toneBg(theme, $tone)};
  color: ${({ theme }) => theme.color.accent.ink};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.radius.pill};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ $size }) => `${Math.round($size * 0.4)}px`};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  flex-shrink: 0;
  overflow: hidden;
`;

export const Img = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
`;
