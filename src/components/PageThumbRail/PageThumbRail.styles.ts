import styled from 'styled-components';

/**
 * Sticky glass pane that floats against the right edge of the canvas scroll
 * area. `position: sticky` keeps it pinned while pages scroll behind it; a
 * capped `max-height` + internal scroll means the rail stays a fixed width
 * even for 100+ page documents.
 */
export const Rail = styled.nav`
  position: sticky;
  top: ${({ theme }) => theme.space[3]};
  align-self: flex-start;
  z-index: 14;
  width: 76px;
  max-height: calc(100vh - 220px);
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
export const Thumb = styled.button<{ readonly $active: boolean }>`
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
`;

/**
 * Absolute-positioned stack of skeleton lines that suggest page content at a
 * glance. Widths are computed per-page in the component so each thumb has a
 * unique fingerprint instead of looking identical.
 */
export const SkeletonLines = styled.div`
  position: absolute;
  left: 6px;
  right: 6px;
  top: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
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

export const PageLabel = styled.span<{ readonly $active: boolean }>`
  font-size: 10px;
  font-family: ${({ theme }) => theme.font.mono};
  color: ${({ $active, theme }) => ($active ? theme.color.indigo[700] : theme.color.fg[3])};
  font-weight: ${({ $active, theme }) =>
    $active ? theme.font.weight.semibold : theme.font.weight.medium};
  line-height: 1;
`;
