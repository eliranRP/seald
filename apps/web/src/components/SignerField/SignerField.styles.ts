import styled, { css, keyframes } from 'styled-components';
import type { SignerFieldKind } from './SignerField.types';

const fieldPulse = keyframes`
  0%,
  100% {
    box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.18);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(79, 70, 229, 0.06);
  }
`;

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
      // Done: the value sits on the paper with no chrome until hovered.
      return css`
        background: transparent;
        border-color: transparent;
        color: ${({ theme }) => theme.color.fg[1]};
        &:hover {
          border-color: ${({ theme }) => theme.color.border[2]};
        }
      `;
    case 'indigo':
      // The current field: solid edge, soft glow that breathes.
      return css`
        background: ${({ theme }) => theme.color.indigo[50]};
        border-color: ${({ theme }) => theme.color.indigo[600]};
        color: ${({ theme }) => theme.color.indigo[700]};
        animation: ${fieldPulse} 1.6s ${({ theme }) => theme.motion.easeOut} infinite;
        @media (prefers-reduced-motion: reduce) {
          animation: none;
          box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.18);
        }
      `;
    case 'amber':
      // Required, still to do: dashed indigo.
      return css`
        background: rgba(238, 242, 255, 0.85);
        border-color: ${({ theme }) => theme.color.indigo[600]};
        color: ${({ theme }) => theme.color.indigo[700]};
      `;
    default:
      return css`
        background: rgba(248, 250, 252, 0.9);
        border-color: ${({ theme }) => theme.color.ink[400]};
        color: ${({ theme }) => theme.color.fg[3]};
      `;
  }
};

export const Root = styled.button<RootProps>`
  position: absolute;
  left: ${({ $x }) => `${$x}px`};
  top: ${({ $y }) => `${$y}px`};
  width: ${({ $w }) => `${$w}px`};
  height: ${({ $h }) => `${$h}px`};
  border: 1.5px ${({ $filled, $active }) => ($filled || $active ? 'solid' : 'dashed')};
  border-radius: ${({ theme, $kind }) =>
    $kind === 'checkbox' ? theme.radius.xxs : theme.radius.xs};
  padding: ${({ $kind }) => ($kind === 'checkbox' ? '0' : '0 10px')};
  display: inline-flex;
  align-items: center;
  justify-content: ${({ $kind }) => ($kind === 'checkbox' ? 'center' : 'flex-start')};
  gap: 6px;
  cursor: pointer;
  font-family: ${({ theme }) => theme.font.sans};
  transition:
    background ${({ theme }) => theme.motion.durBase},
    border-color ${({ theme }) => theme.motion.durBase},
    box-shadow ${({ theme }) => theme.motion.durBase};
  ${({ $tone }) => toneColors($tone)};
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

/** Pill to the left of the current field: where to act and what to do. */
export const FieldTag = styled.span`
  position: absolute;
  top: 50%;
  right: calc(100% + 8px);
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 10px 0 8px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.indigo[600]};
  color: ${({ theme }) => theme.color.fgOnAccent};
  font-size: ${({ theme }) => theme.font.size.xs};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  white-space: nowrap;
  pointer-events: none;
  /* Mobile: the tag sits on top of the field's left edge (canvas Sign-M). */
  @media (max-width: 640px) {
    right: auto;
    left: 0;
    top: -26px;
    transform: none;
  }
`;

export const AutoTag = styled.span`
  display: inline-flex;
  align-items: center;
  height: 16px;
  padding: 0 6px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.ink[100]};
  color: ${({ theme }) => theme.color.fg[3]};
  font-size: ${({ theme }) => theme.font.size.badge};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

/** Canvas `.sfield`: 12px semibold label after a 14px kind icon. */
export const EmptyLabel = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: ${({ theme }) => theme.font.size.xs};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  white-space: nowrap;

  /* The mobile page is scaled down: 12px kind icon (canvas Sign-M). */
  @media (max-width: 640px) {
    & > span:first-child,
    & svg {
      width: 12px;
      height: 12px;
    }
  }
`;

export const RequiredStar = styled.span`
  color: ${({ theme }) => theme.color.danger[500]};
`;

/** Canvas `.sfield.is-done`: the value in 12px medium, dates included. */
export const FilledText = styled.span`
  min-width: 0;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.xs};
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
  font-weight: ${({ theme }) => theme.font.weight.semibold};
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
