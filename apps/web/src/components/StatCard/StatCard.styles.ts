import styled, { css } from 'styled-components';
import type { BadgeTone } from '../Badge/Badge.types';

/**
 * Compact KPI tile surface. Padding tightened from the kit's 20/20 to
 * 14/16 so the 4-tile dashboard row reads as a quiet stat strip — at
 * 20/20 the tiles competed with the H1 for visual weight.
 */
const cardSurface = css`
  display: block;
  width: 100%;
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  padding: 14px ${({ theme }) => theme.space[4]};
`;

export const Root = styled.div`
  ${cardSurface}
`;

/**
 * Clickable variant — a real `<button>` that maps a stat tile to a
 * filter. The hover treatment (border bumped to `border[2]` + 1 px
 * upward translate) signals interactivity without adding a glyph; the
 * non-interactive `Root` above stays flat.
 */
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
    box-shadow ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard},
    transform ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard};

  &:hover {
    border-color: ${({ theme }) => theme.color.border[2]};
    transform: translateY(-1px);
  }
  &[aria-pressed='true'] {
    border-color: ${({ theme }) => theme.color.indigo[600]};
    box-shadow: inset 0 0 0 1px ${({ theme }) => theme.color.indigo[600]};
  }
`;

/**
 * Stat-tile label — sits above the number. 13 px / semibold / `fg-2` so
 * the label reads stronger than the previous `fg-3` regular treatment;
 * the number itself still dominates the tile.
 */
export const Label = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.color.fg[2]};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
`;

/**
 * Stat-tile value. Dropped from the kit's 32 px to 22 px so the 4-tile
 * row reads as KPI strip, not display hero. The `$tone` prop drives the
 * color; zero-state callers override the tone in the parent component
 * so a `0` value renders neutral regardless of the requested tone.
 */
export const Value = styled.div<{ readonly $tone: BadgeTone }>`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 22px;
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
