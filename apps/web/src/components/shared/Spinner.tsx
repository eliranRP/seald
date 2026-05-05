import styled, { keyframes } from 'styled-components';

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

export interface SpinnerProps {
  /** Diameter in px. Defaults to 22. */
  $size?: number;
  /** Border width in px. Defaults to 2. */
  $borderWidth?: number;
}

/**
 * Shared CSS-only spinner (border-arc animation).
 *
 * Replaces 7 duplicate spinner styled-components scattered across the app.
 * Accepts `$size` and `$borderWidth` transient props so each consumer can
 * match its prior visual without layout shifts.
 *
 * Usage:
 * ```tsx
 * <Spinner $size={28} $borderWidth={3} aria-hidden />
 * ```
 */
export const Spinner = styled.span<SpinnerProps>`
  display: inline-block;
  width: ${({ $size = 22 }) => $size}px;
  height: ${({ $size = 22 }) => $size}px;
  border-radius: 999px;
  border: ${({ $borderWidth = 2 }) => $borderWidth}px solid ${({ theme }) => theme.color.ink[100]};
  border-top-color: ${({ theme }) => theme.color.indigo[600]};
  animation: ${spin} 0.8s linear infinite;
`;
