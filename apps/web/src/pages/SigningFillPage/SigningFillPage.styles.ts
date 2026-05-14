import styled from 'styled-components';
import { ErrorBanner as SharedErrorBanner } from '@/components/shared/ErrorBanner';

export const Page = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: ${({ theme }) => theme.color.ink[100]};
  font-family: ${({ theme }) => theme.font.sans};
`;

export const ActionBar = styled.div`
  background: ${({ theme }) => theme.color.paper};
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
  padding: 12px 24px;
  display: flex;
  align-items: center;
  gap: 14px;
  position: sticky;
  top: 60px;
  z-index: ${({ theme }) => theme.z.sticky};

  /* Mobile: wrap chrome to two rows so the page-toolbar + primary CTA stay
     reachable on a 375px-wide iPhone viewport. The desktop layout
     overflows the screen here without wrapping (rule 4.6 — keep elements
     reachable; tested at 375x667 against the ilovepdf reference). */
  @media (max-width: 768px) {
    flex-wrap: wrap;
    padding: 8px 12px;
    gap: 8px;
  }
`;

export const ProgressWrap = styled.div`
  flex: 1;
  max-width: 420px;
  display: flex;
  align-items: center;
  gap: 12px;

  /* Mobile: progress bar takes full width on its own row above the
     toolbar/CTA cluster. */
  @media (max-width: 768px) {
    flex: 1 0 100%;
    max-width: none;
  }
`;

/**
 * Right-aligned numeric count next to the progress bar. Hidden on
 * mobile (audit report-B-signer.md, SigningFillPage [MEDIUM] layout) —
 * the count is folded into the progress label instead so the chrome
 * row doesn't collide with the wrapped second row.
 */
export const ProgressCount = styled.div`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
  font-family: ${({ theme }) => theme.font.mono};
  white-space: nowrap;

  @media (max-width: 768px) {
    display: none;
  }
`;

export const Spacer = styled.div`
  flex: 1;

  /* Mobile: the action bar wraps to a second row, so the spacer would
     consume an entire row by itself. Drop it from the layout there and
     let the chrome cluster naturally fill from the left. */
  @media (max-width: 768px) {
    display: none;
  }
`;

export const NextBtn = styled.button`
  height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.indigo[600]};
  color: ${({ theme }) => theme.color.paper};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
`;

export const ReviewBtn = styled.button`
  height: 36px;
  padding: 0 16px;
  border: none;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.success[500]};
  color: ${({ theme }) => theme.color.paper};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
`;

export const DeclineBtn = styled.button`
  height: 36px;
  padding: 0 14px;
  border: 1px solid ${({ theme }) => theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: transparent;
  color: ${({ theme }) => theme.color.fg[2]};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;
`;

/**
 * Issue #41 — Withdraw-consent affordance promised by the ESIGN
 * Disclosure §3 ("withdraw your consent at any time before signing the
 * document by clicking Withdraw consent on the signing screen"). Kept
 * visually quieter than Decline so it does not invite accidental
 * activation, but reachable from every signing-screen step.
 */
export const WithdrawBtn = styled.button`
  height: 36px;
  padding: 0 12px;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.color.fg[3]};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.regular};
  text-decoration: underline;
  cursor: pointer;
  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  /* Mobile: hide from the sticky chrome to keep the action row scannable.
     The ESIGN withdraw affordance is still reachable from the
     SigningPrepPage WithdrawLink (line ~208) and SigningReviewPage
     WithdrawLink (line ~394) on every viewport, so removing it from the
     fill-screen toolbar on mobile does not break the §3 promise. */
  @media (max-width: 768px) {
    display: none;
  }
`;

/**
 * Center column: document canvas on the left, pages rail on the right.
 * `overflow: auto` on the scroll container so rail stays pinned while pages scroll.
 */
export const Center = styled.div`
  flex: 1;
  display: flex;
  min-height: 0;
`;

export const CenterScroll = styled.div`
  flex: 1;
  min-width: 0;
  overflow: auto;
  position: relative;
  display: flex;
  justify-content: center;
  padding: 24px 0 80px;

  /* Mobile: shrink top/bottom padding so the PDF can use the
     viewport, and let horizontal pan work since the canvas is
     fixed at 560px (field positions are absolute against that
     coordinate space — see CANVAS_WIDTH in SigningFillPage.tsx).
     justify-content stays center on wider mobile but flips to
     flex-start on narrow viewports so the doc anchors at the
     left edge instead of clipping symmetrically. */
  @media (max-width: 768px) {
    padding: 12px 0 64px;
    justify-content: flex-start;
  }
`;

/**
 * Pages-stack wrapper. The `$zoom` prop drives the `transform: scale()`
 * directly on the styled-component (audit report-B-signer.md, SigningFillPage
 * [MEDIUM] type — was previously an inline `style={{ transform }}` prop in
 * the page body). Keeping the transform on the styled-component lets the
 * origin live in one place and removes a stale-inline-style render path.
 */
export const PagesStack = styled.div<{ readonly $zoom: number }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  /* Origin is top-left on mobile so the doc anchors at the left edge
     (matches CenterScroll's flex-start on narrow viewports). Desktop
     keeps top-center so the doc stays optically centered as it zooms. */
  transform-origin: top center;
  transform: ${({ $zoom }) => `scale(${$zoom})`};
  will-change: transform;

  @media (max-width: 768px) {
    transform-origin: top left;
  }
`;

export const RailSlot = styled.aside`
  flex: 0 0 auto;
  border-left: 1px solid ${({ theme }) => theme.color.border[1]};
  background: ${({ theme }) => theme.color.paper};
  padding: 16px 10px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  align-items: stretch;

  /* Mobile: page-thumb rail eats ~76px of horizontal space — drop it on
     small viewports. Page navigation stays available via the PageToolbar
     in the ActionBar (prev/next arrows + page indicator). */
  @media (max-width: 768px) {
    display: none;
  }
`;

export const ErrorBanner = styled(SharedErrorBanner)`
  margin: 12px 24px 0;

  @media (max-width: 768px) {
    margin: 8px 12px 0;
  }
`;

/**
 * Mobile kebab — opens a sheet with Decline / Withdraw consent /
 * Need help. The desktop WithdrawBtn stays hidden on mobile
 * (audit report-B-signer.md, SigningFillPage [MEDIUM] interaction).
 * The page renders this conditionally on a JS `isMobile` flag, so
 * the component itself doesn't need a media-query display switch.
 */
export const OverflowKebab = styled.button`
  height: 36px;
  width: 36px;
  border: 1px solid ${({ theme }) => theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: transparent;
  color: ${({ theme }) => theme.color.fg[2]};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const OverflowMenuBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(11, 18, 32, 0.36);
  z-index: ${({ theme }) => theme.z.overlay};
  display: flex;
  align-items: flex-end;
  justify-content: stretch;
`;

export const OverflowMenuSheet = styled.div`
  background: ${({ theme }) => theme.color.paper};
  width: 100%;
  border-top-left-radius: ${({ theme }) => theme.radius.lg};
  border-top-right-radius: ${({ theme }) => theme.radius.lg};
  padding: ${({ theme }) => theme.space[4]};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
  box-shadow: ${({ theme }) => theme.shadow.lg};
`;

export const OverflowMenuItem = styled.button`
  height: 48px;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.color.fg[1]};
  font-size: ${({ theme }) => theme.font.size.body};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  text-align: left;
  padding: 0 ${({ theme }) => theme.space[3]};
  border-radius: ${({ theme }) => theme.radius.sm};
  cursor: pointer;

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

export const OverflowMenuDanger = styled(OverflowMenuItem)`
  color: ${({ theme }) => theme.color.danger[700]};
`;

/**
 * Mobile "Fields" toggle — opens a panel listing every field on the
 * active page so the signer can jump to optional fields (the
 * sticky page-toolbar's "next field" jumps to required-unfilled
 * only). Audit item 5.
 */
export const FieldsToggle = styled.button`
  height: 36px;
  padding: 0 12px;
  border: 1px solid ${({ theme }) => theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: transparent;
  color: ${({ theme }) => theme.color.fg[2]};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const FieldsPanelBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(11, 18, 32, 0.36);
  z-index: ${({ theme }) => theme.z.overlay};
  display: flex;
  align-items: flex-end;
  justify-content: stretch;
`;

export const FieldsPanelSheet = styled.div`
  background: ${({ theme }) => theme.color.paper};
  width: 100%;
  max-height: 70vh;
  border-top-left-radius: ${({ theme }) => theme.radius.lg};
  border-top-right-radius: ${({ theme }) => theme.radius.lg};
  padding: ${({ theme }) => theme.space[4]};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]};
  box-shadow: ${({ theme }) => theme.shadow.lg};
  overflow: auto;
`;

export const FieldsPanelTitle = styled.h2`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.h5};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const FieldsPanelItem = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => theme.space[3]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.paper};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[1]};
  cursor: pointer;
  text-align: left;
  font-family: inherit;

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const FieldsPanelStatus = styled.span<{
  readonly $tone: 'filled' | 'required' | 'optional';
}>`
  font-size: ${({ theme }) => theme.font.size.micro};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${({ theme, $tone }) =>
    $tone === 'filled'
      ? theme.color.success[700]
      : $tone === 'required'
        ? theme.color.warn[700]
        : theme.color.fg[3]};
`;

/* Audit item 9 — optional-fields review prompt. Styled-component card kept
   minimal; reuses the design-system DialogPrimitives idiom but kept local
   so the dialog can carry its own role + named title. */
export const OptionalDialogBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(11, 18, 32, 0.48);
  z-index: ${({ theme }) => theme.z.modal};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.space[5]};
`;

export const OptionalDialogCard = styled.div`
  background: ${({ theme }) => theme.color.bg.surface};
  border-radius: ${({ theme }) => theme.radius.xl};
  box-shadow: ${({ theme }) => theme.shadow.xl};
  padding: ${({ theme }) => theme.space[6]};
  width: 100%;
  max-width: 440px;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
`;

export const OptionalDialogTitle = styled.h2`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h4};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const OptionalDialogBody = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.body};
  color: ${({ theme }) => theme.color.fg[3]};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
`;

export const OptionalDialogFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.space[2]};
`;

export const OptionalSecondaryBtn = styled.button`
  height: 36px;
  padding: 0 14px;
  border: 1px solid ${({ theme }) => theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: transparent;
  color: ${({ theme }) => theme.color.fg[2]};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const OptionalPrimaryBtn = styled.button`
  height: 36px;
  padding: 0 16px;
  border: none;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.indigo[600]};
  color: ${({ theme }) => theme.color.paper};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;
