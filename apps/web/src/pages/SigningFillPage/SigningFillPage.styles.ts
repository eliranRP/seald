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

export const ProgressCount = styled.div`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
  font-family: ${({ theme }) => theme.font.mono};
  white-space: nowrap;
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

export const PagesStack = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  /* Zoom is applied via an inline transform from SigningFillPage; this
     sets the origin so pages grow downward from the top rather than
     from the center (keeps the top-of-doc anchored while scrolling). */
  transform-origin: top center;
  will-change: transform;
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
