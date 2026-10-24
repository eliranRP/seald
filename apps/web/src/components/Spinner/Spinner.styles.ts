import styled from 'styled-components';
import { MOTION_KEYFRAMES } from '@/styles/motion';
import type { SpinnerSize } from './Spinner.types';

const SIZE: Record<SpinnerSize, string> = { sm: '12px', md: '16px', lg: '24px' };

export const SpinnerRoot = styled.span<{ $size: SpinnerSize }>`
  display: inline-block;
  flex: none;
  width: ${({ $size }) => SIZE[$size]};
  height: ${({ $size }) => SIZE[$size]};
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: ${MOTION_KEYFRAMES.spin} 0.8s linear infinite;
  @media (prefers-reduced-motion: reduce) {
    animation-duration: 2.4s !important;
    animation-iteration-count: infinite !important;
  }
`;
