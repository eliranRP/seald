import styled from 'styled-components';

/**
 * Root app shell — pinned to the viewport so NavBar + SideBar stay anchored no
 * matter how tall the zoomed canvas grows. Without `height: 100vh` + `overflow:
 * hidden`, a highly-zoomed PDF would push Shell taller than the viewport and
 * the entire page (NavBar included) would scroll as a unit — the PDF would
 * appear to "destroy" the chrome hierarchy by scrolling past it.
 */
export const Shell = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: ${({ theme }) => theme.color.bg.app};
  font-family: ${({ theme }) => theme.font.sans};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Body = styled.div`
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
`;

export const Workspace = styled.div`
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  background: ${({ theme }) => theme.color.ink[50]};
  user-select: none;
`;

/**
 * Center column: header at top, scrollable canvas area in the middle, thumb
 * strip at the bottom. `overflow: hidden` keeps the canvas scroll confined to
 * `CanvasScroll` below so the toolbar + thumb strip stay pinned at all zoom
 * levels instead of drifting off-screen with the zoomed canvas.
 */
export const Center = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

/**
 * Scrollable wrapper around the canvas ONLY. The toolbar sits outside this
 * element so it stays pinned at any zoom level. Rendered as a flex row so the
 * sticky page thumbnail rail can live as a sibling of the centered canvas
 * column instead of stacking below it.
 */
export const CanvasScroll = styled.div`
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
`;

/**
 * Main canvas column inside `CanvasScroll`. `min-width: min-content` lets this
 * div grow to fit a zoomed canvas wider than the viewport (enabling horizontal
 * scroll in both directions), while `min-height: 100%` preserves vertical
 * centering when the canvas is shorter than the viewport. `flex: 1` ensures it
 * claims the remaining width next to the fixed-width rail on the right.
 */
export const CenterInner = styled.div`
  flex: 1 1 auto;
  min-height: 100%;
  min-width: min-content;
  padding: ${({ theme }) => theme.space[6]} 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};
`;

/**
 * Wrapper that reserves inline spacing around the sticky `PageThumbRail`. The
 * rail itself owns its sticky positioning; this slot just keeps the rail away
 * from the canvas edge and the scroll container's right gutter so it doesn't
 * feel glued to either.
 */
export const RailSlot = styled.div`
  flex-shrink: 0;
  align-self: stretch;
  display: flex;
  padding: ${({ theme }) => `${theme.space[6]} ${theme.space[3]} ${theme.space[6]} 0`};
`;

/**
 * Static top bar slot that holds `CenterHeader`. Kept as its own styled div so
 * the toolbar + back button never shrink or get squeezed when the canvas area
 * grows very tall.
 */
export const CenterTop = styled.div`
  flex-shrink: 0;
`;

export const CenterHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  max-width: 780px;
  padding: 0 ${({ theme }) => theme.space[6]};
`;

export const CenterHeaderSide = styled.div`
  min-width: 68px;
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
`;

export const RightRailInner = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

export const RightRailScroll = styled.div`
  flex: 1 1 auto;
  overflow: auto;
  padding: ${({ theme }) => theme.space[4]};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
`;

export const RightRailFooter = styled.div`
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
`;

export const CanvasWrap = styled.div`
  position: relative;
`;

/**
 * Sizer that reserves layout space equal to the scaled paper. Its inner child
 * applies `transform: scale(zoom)` with origin top-left — CSS transforms don't
 * reflow by default, so without this sizer the scroll container wouldn't know
 * to make room for the zoomed paper. Width/height are set inline from measured
 * paper dims × zoom.
 */
export const CanvasScaler = styled.div`
  position: relative;
`;

export const CanvasScaleInner = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: top left;
`;

export const MarqueeRect = styled.div`
  position: absolute;
  pointer-events: none;
  border: 1px solid ${({ theme }) => theme.color.indigo[500]};
  background: ${({ theme }) => theme.color.indigo[100]};
  opacity: 0.35;
  border-radius: ${({ theme }) => theme.radius.sm};
  z-index: 1;
`;

/**
 * A dashed indigo line rendered on the canvas while the user drags a field
 * that aligns (within a few pixels) with a peer's left/right/center or
 * top/bottom/middle edge — helps users line things up without pixel-hunting.
 */
export const SnapGuide = styled.div<{ readonly $orientation: 'h' | 'v' }>`
  position: absolute;
  pointer-events: none;
  background: ${({ theme }) => theme.color.indigo[500]};
  z-index: 7;
  ${({ $orientation }) =>
    $orientation === 'v' ? 'top: 0; bottom: 0; width: 1px;' : 'left: 0; right: 0; height: 1px;'}
`;

/**
 * Dashed indigo rectangle drawn around the axis-aligned bounding box of a
 * multi-field selection. Makes it obvious at a glance which fields are
 * grouped, especially when the group's members are spread out or when
 * individual field halos are hidden (as in group mode).
 */
export const GroupBoundary = styled.div`
  position: absolute;
  pointer-events: none;
  border: 1.5px dashed ${({ theme }) => theme.color.indigo[500]};
  background: ${({ theme }) => theme.color.indigo[50]};
  opacity: 0.35;
  border-radius: ${({ theme }) => theme.radius.sm};
  z-index: 4;
`;

/**
 * Floating toolbar shown above the bounding box of a multi-field selection.
 * Lets the user duplicate or delete every selected field at once instead of
 * having to do it one field at a time.
 */
export const GroupToolbar = styled.div`
  position: absolute;
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]};
  padding: 4px;
  background: ${({ theme }) => theme.color.ink[900]};
  border-radius: ${({ theme }) => theme.radius.sm};
  box-shadow: ${({ theme }) => theme.shadow.md};
  z-index: 6;
`;

export const GroupToolbarLabel = styled.span`
  padding: 0 ${({ theme }) => theme.space[2]};
  color: ${({ theme }) => theme.color.fg.inverse};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
`;

export const GroupToolbarButton = styled.button<{ readonly $tone: 'indigo' | 'danger' }>`
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 6px;
  background: ${({ $tone, theme }) =>
    $tone === 'danger' ? theme.color.danger[500] : theme.color.indigo[600]};
  color: ${({ theme }) => theme.color.fg.inverse};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  appearance: none;
  &:hover {
    filter: brightness(1.08);
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;
