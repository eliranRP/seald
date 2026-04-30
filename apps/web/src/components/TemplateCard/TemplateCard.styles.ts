import styled, { css } from 'styled-components';
import type { TemplateCardAccent } from './TemplateCard.types';

/**
 * Per-accent color set used by `MiniThumb`. Each accent maps to:
 *   bg   — washed background panel (palette-50)
 *   mark — strong stripe + signature outline (palette-500)
 *   soft — softer signature fill (palette-100)
 * Mirrors the design guide's `ACCENTS` map.
 */
const ACCENT_BG = css<{ $accent: TemplateCardAccent }>`
  background: ${({ theme, $accent }) => {
    if ($accent === 'amber') return theme.color.warn[50];
    if ($accent === 'emerald') return theme.color.success[50];
    if ($accent === 'pink') return theme.color.danger[50];
    return theme.color.indigo[50];
  }};
`;

const ACCENT_MARK = css<{ $accent: TemplateCardAccent }>`
  background: ${({ theme, $accent }) => {
    if ($accent === 'amber') return theme.color.warn[500];
    if ($accent === 'emerald') return theme.color.success[500];
    if ($accent === 'pink') return theme.color.danger[500];
    return theme.color.indigo[500];
  }};
`;

const ACCENT_SOFT = css<{ $accent: TemplateCardAccent }>`
  background: ${({ theme, $accent }) => {
    if ($accent === 'amber') return theme.color.warn[50];
    if ($accent === 'emerald') return theme.color.success[50];
    if ($accent === 'pink') return theme.color.danger[50];
    return theme.color.indigo[100];
  }};
  border: 1px solid
    ${({ theme, $accent }) => {
      if ($accent === 'amber') return theme.color.warn[500];
      if ($accent === 'emerald') return theme.color.success[500];
      if ($accent === 'pink') return theme.color.danger[500];
      return theme.color.indigo[500];
    }};
`;

/* ============================================================
 * Card root
 * ============================================================ */

export const Root = styled.article`
  position: relative;
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: 16px;
  padding: 14px;
  cursor: pointer;
  transition:
    border-color 140ms ease,
    box-shadow 140ms ease,
    transform 140ms ease;
  display: flex;
  flex-direction: column;
  gap: 12px;

  &:hover,
  &:focus-within {
    border-color: ${({ theme }) => theme.color.indigo[300]};
    box-shadow: ${({ theme }) => theme.shadow.md};
    transform: translateY(-1px);
  }
`;

/* ============================================================
 * MiniThumb — proportional 4:3 paper preview
 * ============================================================ */

export const MiniThumb = styled.div<{ $accent: TemplateCardAccent }>`
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: 12px;
  overflow: hidden;
  ${ACCENT_BG}
`;

/**
 * Faux paper centered on the accent panel. The DG renders a 3:4 paper
 * tile with shadow + 7 grey lines + a signature box at the bottom.
 */
export const ThumbPaper = styled.div`
  position: absolute;
  left: 50%;
  top: 52%;
  transform: translate(-50%, -50%);
  width: 58%;
  aspect-ratio: 3 / 4;
  background: ${({ theme }) => theme.color.paper};
  border-radius: 3px;
  padding: 10% 11%;
  display: flex;
  flex-direction: column;
  gap: 4%;
  box-shadow: ${({ theme }) => theme.shadow.paper};
`;

export const ThumbStripe = styled.div<{ $accent: TemplateCardAccent }>`
  height: 4%;
  border-radius: 1px;
  width: 48%;
  ${ACCENT_MARK}
`;

export const ThumbSpacer = styled.div`
  height: 2%;
`;

export const ThumbLine = styled.div<{ $width: number }>`
  height: 2.4%;
  border-radius: 1px;
  background: ${({ theme }) => theme.color.ink[200]};
  width: ${({ $width }) => `${$width}%`};
`;

export const ThumbSig = styled.div<{ $accent: TemplateCardAccent }>`
  position: absolute;
  left: 14%;
  right: 46%;
  bottom: 14%;
  height: 7%;
  border-radius: 2px;
  ${ACCENT_SOFT}
`;

export const ThumbPagesChip = styled.div`
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 3px 8px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: rgba(255, 255, 255, 0.92);
  font-size: 10px;
  font-weight: ${({ theme }) => theme.font.weight.bold};
  font-family: ${({ theme }) => theme.font.mono};
  color: ${({ theme }) => theme.color.fg[2]};
  letter-spacing: 0.04em;
  box-shadow: ${({ theme }) => theme.shadow.xs};
`;

/* ============================================================
 * Card body
 * ============================================================ */

export const Body = styled.div`
  padding: 0 4px;
  min-height: 64px;
`;

export const Name = styled.h3`
  font-size: 14px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  line-height: 1.3;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const TagRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  flex-wrap: wrap;
`;

export const TagPill = styled.button<{ $bg: string; $fg: string }>`
  font-size: 10.5px;
  font-weight: ${({ theme }) => theme.font.weight.bold};
  letter-spacing: 0.02em;
  padding: 2px 7px;
  border-radius: ${({ theme }) => theme.radius.pill};
  border: none;
  cursor: pointer;
  background: ${({ $bg }) => $bg};
  color: ${({ $fg }) => $fg};
  font-family: inherit;
`;

export const TagOverflowPill = styled.button`
  font-size: 10.5px;
  font-weight: ${({ theme }) => theme.font.weight.bold};
  letter-spacing: 0.02em;
  padding: 2px 7px;
  border-radius: ${({ theme }) => theme.radius.pill};
  border: none;
  cursor: pointer;
  background: ${({ theme }) => theme.color.ink[100]};
  color: ${({ theme }) => theme.color.fg[2]};
  font-family: inherit;
`;

export const StatRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: 11.5px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const StatItem = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
`;

export const StatDot = styled.span`
  width: 2px;
  height: 2px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.ink[300]};
`;

export const StatMono = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
`;

/* ============================================================
 * Floating action overlay (revealed on card hover)
 * ============================================================ */

/**
 * Action overlay sits over the thumbnail and reveals on hover/focus
 * via opacity. We deliberately keep `pointer-events: auto` always so
 * the buttons stay reachable by keyboard + tests; only the visual
 * curtain animates in. Without this, jsdom (no real hover events)
 * can't drive the actions, and screen readers wouldn't surface them
 * either.
 */
export const ActionOverlay = styled.div`
  position: absolute;
  top: 22px;
  left: 22px;
  right: 22px;
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  opacity: 0;
  transition: opacity 140ms ease;

  ${Root}:hover &,
  ${Root}:focus-within & {
    opacity: 1;
  }

  & > button:focus-visible {
    opacity: 1;
  }
`;

const baseAction = css`
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: 8px;
  padding: 6px 8px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  font-family: inherit;
  color: ${({ theme }) => theme.color.fg[1]};
  box-shadow: ${({ theme }) => theme.shadow.xs};
`;

export const ActionButton = styled.button`
  ${baseAction}
`;

export const ActionPrimary = styled.button`
  ${baseAction}
  background: ${({ theme }) => theme.color.ink[900]};
  color: ${({ theme }) => theme.color.fg.inverse};
  border: none;
  padding: 6px 10px;
`;

export const ActionDanger = styled.button`
  ${baseAction}
  color: ${({ theme }) => theme.color.danger[700]};
  padding: 6px 8px;

  &:hover,
  &:focus-visible {
    background: ${({ theme }) => theme.color.danger[50]};
    border-color: ${({ theme }) => theme.color.danger[500]};
  }
`;
