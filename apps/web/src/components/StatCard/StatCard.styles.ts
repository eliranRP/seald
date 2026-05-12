import styled, { css } from 'styled-components';
import type { BadgeTone } from '../Badge/Badge.types';

const cardSurface = css`
  display: block;
  width: 100%;
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  padding: ${({ theme }) => `${theme.space[5]} ${theme.space[5]}`};
`;

export const Root = styled.div`
  ${cardSurface}
`;

/** Clickable variant — a real <button> that maps a stat tile to a filter. */
export const InteractiveRoot = styled.button`
  ${cardSurface}
  appearance: none;
  margin: 0;
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
  transition:
    border-color ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard},
    box-shadow ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard};

  &:hover {
    border-color: ${({ theme }) => theme.color.indigo[300]};
  }
  &[aria-pressed='true'] {
    border-color: ${({ theme }) => theme.color.indigo[600]};
    box-shadow: inset 0 0 0 1px ${({ theme }) => theme.color.indigo[600]};
  }
`;

export const Label = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.color.fg[3]};
  font-weight: ${({ theme }) => theme.font.weight.medium};
`;

export const Value = styled.div<{ readonly $tone: BadgeTone }>`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 32px;
  font-weight: ${({ theme }) => theme.font.weight.medium};
  letter-spacing: ${({ theme }) => theme.font.tracking.tight};
  margin-top: ${({ theme }) => theme.space[1]};
  color: ${({ $tone, theme }) => {
    if ($tone === 'indigo') return theme.color.indigo[600];
    if ($tone === 'amber') return theme.color.warn[500];
    if ($tone === 'emerald') return theme.color.success[500];
    if ($tone === 'red') return theme.color.danger[500];
    return theme.color.fg[2];
  }};
`;
