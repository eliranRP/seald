import styled, { css, keyframes } from 'styled-components';
import type { SkeletonVariant } from './Skeleton.types';

const shimmer = keyframes`
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
`;

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
  background-color: ${({ theme }) => theme.color.ink[150]};
  background-image: linear-gradient(
    90deg,
    ${({ theme }) => theme.color.ink[150]} 0%,
    ${({ theme }) => theme.color.ink[100]} 50%,
    ${({ theme }) => theme.color.ink[150]} 100%
  );
  background-size: 200% 100%;
  background-position: 200% 0;
  border-radius: ${({ theme, $variant }) => {
    if ($variant === 'circle') return theme.radius.pill;
    if ($variant === 'rect') return theme.radius.xs;
    return theme.radius.sm;
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
      animation: ${shimmer} 1.4s ease-in-out infinite;
    `}
  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;
