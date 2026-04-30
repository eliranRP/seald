import styled from 'styled-components';

/**
 * Page container — fills the slot AppShell carves out under the NavBar.
 * `min-height: 0` + `overflow: hidden` keep the zoomed canvas confined to
 * `CanvasScroll`; without them a highly-zoomed PDF would push Shell taller
 * than its parent and the whole page (NavBar included) would scroll as a
 * unit — the PDF would appear to "destroy" the chrome hierarchy.
 */
export const Shell = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
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
 * Wrapper that pins the `PageThumbRail` to the top-right of the canvas scroll
 * viewport. Sticky lives here (not on `PageThumbRail`) because the slot is a
 * direct flex child of `CanvasScroll` — its containing block is the scroll
 * container's content box, which stays in view across the full scroll range.
 * Putting sticky on a deeper descendant would clamp its range to whatever
 * height the flex line resolves to (= the visible scroll area), so the rail
 * would scroll away after the first ~100px.
 */
export const RailSlot = styled.div`
  flex-shrink: 0;
  position: sticky;
  top: ${({ theme }) => theme.space[6]};
  align-self: flex-start;
  display: flex;
  padding: ${({ theme }) => `0 ${theme.space[3]} 0 0`};
  z-index: 14;
`;

/**
 * Static top bar slot that holds `CenterHeader`. Kept as its own styled div so
 * the toolbar + back button never shrink or get squeezed when the canvas area
 * grows very tall.
 */
export const CenterTop = styled.div`
  flex-shrink: 0;
`;

/**
 * Three-column grid: [Back side] [PageToolbar] [empty side]. Middle
 * column is `auto`-sized so the toolbar always renders at the
 * geometric center of the available width regardless of how wide the
 * Center column gets at large viewports (1920+/2560+/3440+).
 *
 * The previous layout used `flex` with `space-between` + a 780px max,
 * which left-anchored the entire bar on wide screens — the page toolbar
 * drifted to the left edge of the canvas instead of staying with it.
 */
export const CenterHeader = styled.div`
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  width: 100%;
  padding: 0 ${({ theme }) => theme.space[6]};
`;

export const CenterHeaderSide = styled.div`
  min-width: 68px;
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};

  /* Right-side slot uses justify-self: end so the (currently empty)
     reserved spot mirrors the back button on the opposite edge — keeps
     the toolbar visually centered when the back button is absent. */
  &:last-child {
    justify-content: flex-end;
  }
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

/**
 * Slot above the canvas reserved for contextual banners — used by
 * the templates flow's `TemplateModeBanner`. Padded so it never abuts
 * the canvas scroll. Empty by default; doesn't reserve space when no
 * banner is rendered.
 */
export const BannerSlot = styled.div`
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[8]} 0`};
  background: ${({ theme }) => theme.color.bg.app};
`;

/* ---------- Template-mode right rail ---------- */

/**
 * Indigo-washed summary card pinned at the top of the right rail when
 * the editor is in `templateMode='authoring'`. Replaces the Signers
 * panel — the user is creating a template, not sending to specific
 * recipients yet.
 */
export const TemplateSummaryCard = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  background: ${({ theme }) => theme.color.indigo[50]};
  border: 1px solid ${({ theme }) => theme.color.indigo[300]};
  border-radius: ${({ theme }) => theme.radius.md};
  margin: 4px 4px 12px;
`;

export const TemplateSummaryIcon = styled.span`
  width: 28px;
  height: 28px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.paper};
  color: ${({ theme }) => theme.color.indigo[700]};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

export const TemplateSummaryBody = styled.div`
  flex: 1;
  min-width: 0;
`;

export const TemplateSummaryEyebrow = styled.div`
  font-size: 11px;
  font-weight: ${({ theme }) => theme.font.weight.bold};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.indigo[700]};
`;

export const TemplateSummaryText = styled.p`
  margin: 4px 0 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: ${({ theme }) => theme.color.fg[2]};
`;

/**
 * Primary "Save as template" CTA used in template-authoring mode. Same
 * visual weight as `Send to sign` but keyed to the templates flow —
 * indigo primary surface that ends the wizard.
 */
export const TemplatePrimaryFooter = styled.div`
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

export const TemplatePrimaryStatus = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const TemplatePrimaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 44px;
  border: none;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.indigo[600]};
  color: ${({ theme }) => theme.color.fg.inverse};
  font-size: 14px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;
  font-family: inherit;
  transition: background 140ms;

  &:hover,
  &:focus-visible {
    background: ${({ theme }) => theme.color.indigo[700]};
  }

  &:disabled {
    background: ${({ theme }) => theme.color.ink[300]};
    color: ${({ theme }) => theme.color.fg.inverse};
    cursor: not-allowed;
  }
`;

/**
 * Quiet "Save as template" affordance pinned above the Send footer. We
 * keep it visually subordinate to the primary Send CTA — it's a
 * power-user shortcut for senders who want to capture this layout for
 * reuse, not something the every-document sender needs to notice.
 * Dashed border + ghost background matches `SaveTemplateBtn` on the
 * SigningReviewPage so the affordance feels like the same product
 * surface across both flows.
 */
export const SaveAsTemplateRow = styled.div`
  display: flex;
  justify-content: flex-end;
  padding: ${({ theme }) => theme.space[3]} ${({ theme }) => theme.space[4]};
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
`;

export const SaveAsTemplateButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  background: transparent;
  border: 1px dashed ${({ theme }) => theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.md};
  padding: 8px 14px;
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[2]};
  cursor: pointer;
  &:hover,
  &:focus-visible {
    border-color: ${({ theme }) => theme.color.indigo[500]};
    color: ${({ theme }) => theme.color.indigo[700]};
  }
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

/**
 * Vertical stack of all pages rendered continuously so the user can scroll
 * between them instead of flipping one at a time. Replaces the prior "render
 * only currentPage" layout.
 */
export const PageStack = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[5]};
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
