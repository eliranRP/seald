import styled, { css, type DefaultTheme } from 'styled-components';
import type { ButtonSize, ButtonVariant } from './Button.types';

const sizeStyles = (t: DefaultTheme, size: ButtonSize) =>
  ({
    sm: css`
      padding: ${t.space[1]} ${t.space[3]};
      font-size: ${t.font.size.bodySm};
      border-radius: ${t.radius.sm};
    `,
    md: css`
      padding: ${t.space[2]} ${t.space[4]};
      font-size: ${t.font.size.bodySm};
      border-radius: ${t.radius.md};
    `,
    lg: css`
      padding: ${t.space[3]} ${t.space[5]};
      font-size: ${t.font.size.body};
      border-radius: ${t.radius.md};
    `,
  })[size];

const variantStyles = (t: DefaultTheme, v: ButtonVariant) =>
  ({
    primary: css`
      background: ${t.color.indigo[600]};
      color: ${t.color.accent.ink};
      border-color: ${t.color.indigo[600]};
      &:hover:not(:disabled) {
        background: ${t.color.indigo[700]};
        border-color: ${t.color.indigo[700]};
      }
      &:active:not(:disabled) {
        background: ${t.color.indigo[800]};
        border-color: ${t.color.indigo[800]};
        transform: scale(0.98);
      }
    `,
    secondary: css`
      background: ${t.color.paper};
      color: ${t.color.fg[1]};
      border-color: ${t.color.border[1]};
      &:hover:not(:disabled) {
        background: ${t.color.bg.subtle};
      }
    `,
    ghost: css`
      background: transparent;
      color: ${t.color.fg[2]};
      border-color: transparent;
      &:hover:not(:disabled) {
        background: ${t.color.bg.subtle};
      }
    `,
    danger: css`
      background: ${t.color.paper};
      color: ${t.color.danger[700]};
      border-color: ${t.color.danger[500]};
      &:hover:not(:disabled) {
        background: ${t.color.danger[50]};
      }
    `,
    dark: css`
      background: ${t.color.ink[900]};
      color: ${t.color.accent.ink};
      border-color: ${t.color.ink[900]};
      &:hover:not(:disabled) {
        background: ${t.color.ink[800]};
        border-color: ${t.color.ink[800]};
      }
    `,
  })[v];

export const ButtonRoot = styled.button<{
  $variant: ButtonVariant;
  $size: ButtonSize;
  $fullWidth: boolean;
}>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space[2]};
  font-family: ${({ theme }) => theme.font.sans};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  line-height: 1.2;
  border: 1px solid transparent;
  cursor: pointer;
  transition:
    background ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard},
    border-color ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard},
    transform ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard},
    box-shadow ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard};
  width: ${({ $fullWidth }) => ($fullWidth ? '100%' : 'auto')};
  ${({ theme, $size }) => sizeStyles(theme, $size)}
  ${({ theme, $variant }) => variantStyles(theme, $variant)}
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
  &:disabled,
  &[aria-busy='true'] {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const Spinner = styled.span`
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid currentColor;
  border-top-color: transparent;
  animation: spin 800ms linear infinite;
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;
