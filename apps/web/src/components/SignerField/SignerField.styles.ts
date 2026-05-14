import styled, { css } from 'styled-components';
import type { SignerFieldKind } from './SignerField.types';

export type Tone = 'success' | 'indigo' | 'amber' | 'neutral';

interface RootProps {
  readonly $tone: Tone;
  readonly $kind: SignerFieldKind;
  readonly $filled: boolean;
  readonly $active: boolean;
  readonly $x: number;
  readonly $y: number;
  readonly $w: number;
  readonly $h: number;
}

const toneColors = (tone: Tone) => {
  switch (tone) {
    case 'success':
      return css`
        background: rgba(16, 185, 129, 0.1);
        border-color: ${({ theme }) => theme.color.success[500]};
        color: ${({ theme }) => theme.color.success[700]};
      `;
    case 'indigo':
      return css`
        background: rgba(99, 102, 241, 0.12);
        border-color: ${({ theme }) => theme.color.indigo[500]};
        color: ${({ theme }) => theme.color.indigo[700]};
      `;
    case 'amber':
      return css`
        background: rgba(245, 158, 11, 0.1);
        border-color: ${({ theme }) => theme.color.warn[500]};
        color: ${({ theme }) => theme.color.warn[700]};
      `;
    default:
      return css`
        background: rgba(148, 163, 184, 0.1);
        border-color: ${({ theme }) => theme.color.ink[400]};
        color: ${({ theme }) => theme.color.fg[2]};
      `;
  }
};

export const Root = styled.button<RootProps>`
  position: absolute;
  left: ${({ $x }) => `${$x}px`};
  top: ${({ $y }) => `${$y}px`};
  width: ${({ $w }) => `${$w}px`};
  height: ${({ $h }) => `${$h}px`};
  border: 1.5px ${({ $filled }) => ($filled ? 'solid' : 'dashed')};
  border-radius: ${({ theme, $kind }) => ($kind === 'checkbox' ? '4px' : theme.radius.sm)};
  padding: ${({ $kind }) => ($kind === 'checkbox' ? '0' : '0 10px')};
  display: inline-flex;
  align-items: center;
  justify-content: ${({ $kind }) => ($kind === 'checkbox' ? 'center' : 'flex-start')};
  cursor: pointer;
  font-family: ${({ theme }) => theme.font.sans};
  transition:
    background 140ms,
    border-color 140ms,
    box-shadow 140ms;
  ${({ $tone }) => toneColors($tone)};
  ${({ $active }) =>
    $active
      ? css`
          box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.15);
        `
      : ''}
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const EmptyLabel = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: ${({ theme }) => theme.font.size.micro};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: 0.02em;
`;

export const RequiredStar = styled.span`
  color: ${({ theme }) => theme.color.danger[500]};
`;

export const FilledText = styled.span<{ readonly $mono: boolean }>`
  font-family: ${({ theme, $mono }) => ($mono ? theme.font.mono : theme.font.sans)};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[1]};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const InitialScript = styled.span<{ readonly $size: number }>`
  font-family: ${({ theme }) => theme.font.script};
  font-size: ${({ $size }) => `${$size}px`};
  color: ${({ theme }) => theme.color.fg[1]};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  line-height: 1;
`;

/**
 * Non-color "active" indicator — a small chevron anchored to the
 * right edge of the active field. Adds a redundant (non-color) cue
 * so deutan / protan users can distinguish "active" from filled or
 * required-empty without relying on indigo vs amber vs green
 * (audit report-B-signer.md, SigningFillPage [HIGH] a11y).
 */
export const ActiveIndicator = styled.span`
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.color.indigo[700]};
  pointer-events: none;
`;

export const CheckboxMark = styled.span<{ readonly $checked: boolean }>`
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1.5px solid
    ${({ theme, $checked }) => ($checked ? theme.color.success[500] : theme.color.ink[400])};
  background: ${({ theme, $checked }) => ($checked ? theme.color.success[500] : theme.color.paper)};
  color: ${({ theme }) => theme.color.paper};
  display: inline-flex;
  align-items: center;
  justify-content: center;
`;
