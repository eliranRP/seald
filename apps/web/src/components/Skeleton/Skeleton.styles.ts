import styled, { css } from 'styled-components';
import { MOTION_KEYFRAMES } from '@/styles/motion';
import type { SkeletonVariant } from './Skeleton.types';

function toCss(value: number | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'number' ? `${value}px` : value;
}

interface RootProps {
  readonly $variant: SkeletonVariant;
  readonly $width: number | string | undefined;
  readonly $height: number | string | undefined;
  readonly $animated: boolean;
}

export const SkeletonRoot = styled.span<RootProps>`
  display: inline-block;
  vertical-align: middle;
  background-color: ${({ theme }) => theme.color.ink[100]};
  background-image: linear-gradient(
    90deg,
    ${({ theme }) => theme.color.ink[100]} 0%,
    ${({ theme }) => theme.color.ink[150]} 50%,
    ${({ theme }) => theme.color.ink[100]} 100%
  );
  background-size: 200% 100%;
  background-position: 200% 0;
  border-radius: ${({ theme, $variant }) => {
    if ($variant === 'circle' || $variant === 'pill') return theme.radius.pill;
    return theme.radius.xs;
  }};
  width: ${({ $width, $variant }) => toCss($width) ?? ($variant === 'text' ? '100%' : '100%')};
  height: ${({ $height, $variant }) => toCss($height) ?? ($variant === 'text' ? '14px' : '1em')};
  ${({ $variant, $width, $height }) =>
    $variant === 'circle' &&
    css`
      width: ${toCss($width) ?? toCss($height) ?? '24px'};
      height: ${toCss($height) ?? toCss($width) ?? '24px'};
    `}
  ${({ $animated }) =>
    $animated &&
    css`
      animation: ${MOTION_KEYFRAMES.shimmer} 1.4s ease infinite;
    `}
  @media (prefers-reduced-motion: reduce) {
    animation: none !important;
  }
`;
