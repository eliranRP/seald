import styled, { css, type DefaultTheme } from 'styled-components';
import { pressable } from '@/styles/motion';
import type { ButtonSize, ButtonVariant } from './Button.types';

const HEIGHT: Record<ButtonSize, string> = { sm: '32px', md: '44px', lg: '48px' };

const sizeStyles = (t: DefaultTheme, size: ButtonSize, iconOnly: boolean) => {
  const base = {
    sm: css`
      padding: 0 ${t.space[3]};
      font-size: ${t.font.size.caption};
      font-weight: ${t.font.weight.medium};
      border-radius: ${t.radius.sm};
    `,
    md: css`
      padding: 0 18px;
      font-size: ${t.font.size.bodySm};
      border-radius: ${t.radius.md};
    `,
    lg: css`
      padding: 0 ${t.space[5]};
      font-size: ${t.font.size.bodyMd};
      border-radius: ${t.radius.md};
    `,
  }[size];
  return css`
    height: ${HEIGHT[size]};
    ${base}
    ${
      iconOnly &&
      css`
        width: ${HEIGHT[size]};
        height: ${HEIGHT[size]};
        padding: 0;
      `
    }
    ${
      iconOnly &&
      size !== 'sm' &&
      css`
        @media (min-width: 641px) {
          & > span {
            width: 16px;
            height: 16px;
          }
          & > span > svg {
            width: 16px;
            height: 16px;
          }
        }
      `
    }
  `;
};

const variantStyles = (t: DefaultTheme, v: ButtonVariant) =>
  ({
    primary: css`
      border-width: 0;
      background: ${t.color.indigo[600]};
      color: ${t.color.fgOnAccent};
      border-color: ${t.color.indigo[600]};
      &:hover:not(:disabled) {
        background: ${t.color.indigo[700]};
        border-color: ${t.color.indigo[700]};
      }
      &:active:not(:disabled) {
        background: ${t.color.indigo[800]};
        border-color: ${t.color.indigo[800]};
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
      border-width: 0;
      background: transparent;
      color: ${t.color.fg[2]};
      border-color: transparent;
      &:hover:not(:disabled) {
        background: ${t.color.bg.subtle};
      }
    `,
    danger: css`
      border-width: 0;
      background: ${t.color.danger[700]};
      color: ${t.color.fgOnAccent};
      border-color: ${t.color.danger[700]};
      &:hover:not(:disabled) {
        background: ${t.color.danger[800]};
        border-color: ${t.color.danger[800]};
      }
    `,
    dark: css`
      border-width: 0;
      background: ${t.color.ink[900]};
      color: ${t.color.fgOnAccent};
      border-color: ${t.color.ink[900]};
      &:hover:not(:disabled) {
        background: ${t.color.ink[700]};
        border-color: ${t.color.ink[700]};
      }
    `,
  })[v];

export const ButtonRoot = styled.button<{
  $variant: ButtonVariant;
  $size: ButtonSize;
  $fullWidth: boolean;
  $iconOnly: boolean;
}>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  gap: ${({ theme }) => theme.space[2]};
  font-family: ${({ theme }) => theme.font.sans};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  line-height: 1.2;
  text-align: center;
  text-decoration: none;
  white-space: nowrap;
  border: 1px solid transparent;
  cursor: pointer;
  width: ${({ $fullWidth }) => ($fullWidth ? '100%' : 'auto')};
  ${pressable}
  ${({ theme, $size, $iconOnly }) => sizeStyles(theme, $size, $iconOnly)}
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
