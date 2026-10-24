import styled, { css } from 'styled-components';

type Col = { readonly $column: boolean };

/**
 * Glass pane that floats against the right edge of the canvas scroll area.
 * The parent `RailSlot` owns the sticky positioning so the rail stays pinned
 * across the full scroll range. The rail is internally scrollable so a
 * 100-page document doesn't blow up its width.
 *
 * Sizing: capped at the height of `RailSlot`'s sticky window. The slot
 * itself uses `top: ${space[6]}` and the canvas scroll provides the
 * effective viewport. Using `max-height: 100%` (parent-relative)
 * instead of `calc(100vh - 160px)` keeps the rail honest regardless of
 * how much chrome sits above the editor — the templates flow stacks
 * the global NavBar on top of the TemplateFlowHeader, which would push
 * a viewport-derived rail past its container and get its bottom thumbs
 * clipped by the parent's `overflow: hidden`. Falling back to a
 * generous viewport cap for legacy callers (no parent height set) keeps
 * the original behaviour for the regular editor flow at large
 * viewports.
 */
export const Rail = styled.nav<Col>`
  width: 76px;
  /* Cap relative to the viewport, NOT a hard-coded chrome height.
     Originally 'calc(100vh - 160px)', which assumed only the global
     NavBar lived above the editor. The templates flow stacks a
     TemplateFlowHeader sub-chrome on top of the NavBar, pushing the
     rail past the visible area and clipping bottom thumbs. 80vh is
     conservative enough for any reasonable chrome height (up to 20vh
     of page-top affordances) at any practical viewport. */
  max-height: 80vh;
  overflow-y: auto;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(8px);
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  padding: ${({ theme }) => `${theme.space[2]} ${theme.space[2]}`};
  box-shadow: ${({ theme }) => theme.shadow.sm};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
  scrollbar-width: thin;

  /* Canvas .thumbs: 104px column, 16 / 12 padding, 10px gap. */
  ${({ $column, theme }) =>
    $column &&
    css`
      width: 104px;
      height: 100%;
      max-height: none;
      align-items: center;
      gap: 10px;
      padding: ${theme.space[4]} ${theme.space[3]};
      background: ${theme.color.paper};
      backdrop-filter: none;
      border: 0;
      border-left: 1px solid ${theme.color.border[1]};
      border-radius: 0;
      box-shadow: none;
    `}
`;

/** Monospaced "3/12" counter at the top of the rail. */
export const RailHeader = styled.div`
  font-size: 10px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[3]};
  font-family: ${({ theme }) => theme.font.mono};
  text-align: center;
  letter-spacing: 0.06em;
  padding: 2px 0 6px;
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
  margin-bottom: 2px;
`;

/**
 * One thumbnail button. 52×66 rounded card with a decorative skeleton inside
 * and a page-number caption at the bottom. Active state uses the indigo
 * brand color + a soft outer ring to stand out against neighboring thumbs.
 */
export const Thumb = styled.button<{ readonly $active: boolean } & Col>`
  position: relative;
  width: 60px;
  height: 76px;
  margin: 0 auto;
  border-radius: ${({ theme }) => theme.radius.xs};
  background: ${({ theme }) => theme.color.paper};
  border: 1.5px solid
    ${({ $active, theme }) => ($active ? theme.color.indigo[600] : theme.color.border[1])};
  box-shadow: ${({ $active }) => ($active ? '0 0 0 2px rgba(99, 102, 241, 0.18)' : 'none')};
  transition:
    border-color 140ms ease,
    box-shadow 140ms ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding: 6px 4px 4px;
  cursor: pointer;
  appearance: none;
  flex-shrink: 0;

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }

  /* Canvas .thumb: 72px wide at page ratio, number 18px below. */
  ${({ $column, $active, theme }) =>
    $column &&
    css`
      width: 72px;
      height: auto;
      aspect-ratio: 8.5 / 11;
      margin: 0 0 18px;
      padding: 8px 6px;
      border: ${$active ? '1.5px' : '1px'} solid
        ${$active ? theme.color.indigo[600] : theme.color.border[1]};
      border-radius: ${theme.radius.xxs};
      box-shadow: none;
    `}
`;

/**
 * Absolute-positioned stack of skeleton lines that suggest page content at a
 * glance. Widths are computed per-page in the component so each thumb has a
 * unique fingerprint instead of looking identical.
 */
export const SkeletonLines = styled.div<Col>`
  position: absolute;
  left: 6px;
  right: 6px;
  top: ${({ $column }) => ($column ? '8px' : '6px')};
  display: flex;
  flex-direction: column;
  gap: ${({ $column }) => ($column ? '3px' : '2px')};
`;

export const SkeletonLine = styled.span<{ readonly $width: number }>`
  display: block;
  height: 2px;
  border-radius: 1px;
  background: ${({ theme }) => theme.color.ink[150]};
  width: ${({ $width }) => `${String($width)}%`};
`;

/**
 * Pill badge in the top-right of a thumb indicating how many fields are
 * already placed on that page — matches the design's "2" marker.
 */
export const FieldCountBadge = styled.span`
  position: absolute;
  top: 3px;
  right: 3px;
  min-width: 14px;
  height: 14px;
  padding: 0 4px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.indigo[600]};
  color: ${({ theme }) => theme.color.fg.inverse};
  font-size: 9px;
  font-weight: ${({ theme }) => theme.font.weight.bold};
  font-family: ${({ theme }) => theme.font.mono};
  display: inline-flex;
  align-items: center;
  justify-content: center;
`;

export const PageLabel = styled.span<{ readonly $active: boolean } & Col>`
  font-size: 10px;
  font-family: ${({ theme }) => theme.font.mono};
  color: ${({ $active, theme }) => ($active ? theme.color.indigo[700] : theme.color.fg[3])};
  font-weight: ${({ $active, theme }) =>
    $active ? theme.font.weight.semibold : theme.font.weight.medium};
  line-height: 1;

  /* Canvas .thumb-num: 11px under the thumb. */
  ${({ $column, theme }) =>
    $column &&
    css`
      position: absolute;
      bottom: -18px;
      left: 50%;
      transform: translateX(-50%);
      font-family: ${theme.font.sans};
      font-size: ${theme.font.size.micro};
      font-weight: ${theme.font.weight.regular};
      line-height: 14px;
      color: ${theme.color.fg[3]};
    `}
`;

export const ThumbDots = styled.span<Col>`
  position: absolute;
  right: ${({ $column }) => ($column ? '6px' : '4px')};
  bottom: ${({ $column }) => ($column ? '6px' : '4px')};
  display: flex;
  gap: 2px;
`;

export const ThumbDot = styled.i<{ $color: string }>`
  display: block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${({ $color }) => $color};
`;
