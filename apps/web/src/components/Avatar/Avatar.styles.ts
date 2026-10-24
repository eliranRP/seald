import styled, { type DefaultTheme } from 'styled-components';
import type { AvatarTone } from './Avatar.types';

/** Canvas `.avatar` soft tints (`.av-you`, `.av-signed`, `.av-pending`, `.av-declined`, `.av-none`). */
const toneColors = (t: DefaultTheme, tone: AvatarTone): { bg: string; fg: string } =>
  ({
    indigo: { bg: t.color.indigo[50], fg: t.color.indigo[800] },
    emerald: { bg: t.color.success[50], fg: t.color.success[700] },
    amber: { bg: t.color.warn[50], fg: t.color.warn[700] },
    danger: { bg: t.color.danger[50], fg: t.color.danger[700] },
    slate: { bg: t.color.ink[100], fg: t.color.ink[600] },
    neutral: { bg: t.color.ink[100], fg: t.color.ink[600] },
  })[tone];

/** Initials: 10px at 28 (`.avatar`), 12px at 36 (`.avatar-lg`), scaling from there. */
const initialsSize = (size: number): number => Math.max(10, Math.round(size / 3));

export const AvatarRoot = styled.div<{ $size: number; $tone: AvatarTone }>`
  width: ${({ $size }) => `${$size}px`};
  height: ${({ $size }) => `${$size}px`};
  background: ${({ theme, $tone }) => toneColors(theme, $tone).bg};
  color: ${({ theme, $tone }) => toneColors(theme, $tone).fg};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.radius.pill};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ $size }) => `${initialsSize($size)}px`};
  font-weight: ${({ theme }) => theme.font.weight.bold};
  line-height: 1;
  flex-shrink: 0;
  overflow: hidden;
`;

export const Img = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
`;
