import styled, { css } from 'styled-components';

/**
 * Mobile-web sender flow chrome — full-bleed `100dvh` (the kit's "phone"
 * frame is implicit because the page is only routed when the viewport is
 * ≤ 640 px). Tokens come from `apps/web/src/styles/tokens.css` so the
 * design's CSS-var references (`var(--ink-100)`, etc.) work as-is.
 */

export const Shell = styled.div`
  position: relative;
  min-height: 100dvh;
  background: #fff;
  font-family: ${({ theme }) => theme.font.sans};
  display: flex;
  flex-direction: column;
  /* Ensures any sticky bottom CTA can always layer above content. */
  isolation: isolate;
`;

export const Scroller = styled.div<{ $padBottom: number }>`
  flex: 1 1 auto;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: ${({ $padBottom }) => $padBottom}px;
`;

export const Stepper = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px 8px;
`;

export const StepBackBtn = styled.button`
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: none;
  background: var(--ink-100);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--fg-1);

  &:focus-visible {
    outline: 2px solid var(--indigo-600);
    outline-offset: 2px;
  }
`;

export const StepLabelGroup = styled.div`
  flex: 1;
  min-width: 0;
`;

export const StepEyebrow = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  color: var(--fg-3);
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

export const StepTitle = styled.div`
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 14px;
  font-weight: 600;
  color: var(--fg-1);
  margin-top: 2px;
`;

export const StepDots = styled.div`
  display: flex;
  gap: 4px;
`;

export const StepDot = styled.div<{ $active: boolean; $reached: boolean }>`
  width: ${({ $active }) => ($active ? '16px' : '6px')};
  height: 6px;
  border-radius: 3px;
  background: ${({ $reached }) => ($reached ? 'var(--indigo-600)' : 'var(--ink-200)')};
  transition: width 0.2s ease;
`;

export const StickyBar = styled.div`
  position: sticky;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
  padding: 10px 16px calc(20px + env(safe-area-inset-bottom));
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-top: 0.5px solid rgba(0, 0, 0, 0.08);
  display: flex;
  gap: 8px;
`;

const buttonReset = css`
  border: none;
  background: transparent;
  cursor: pointer;
  font: inherit;
  color: inherit;
`;

export const PrimaryBtn = styled.button`
  ${buttonReset};
  flex: 1;
  padding: 14px;
  border-radius: 14px;
  background: var(--indigo-600);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 48px;

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid var(--indigo-700);
    outline-offset: 3px;
  }
`;

export const SecondaryBtn = styled(PrimaryBtn)`
  background: #fff;
  color: var(--fg-1);
  border: 1px solid var(--border-1);

  &:focus-visible {
    outline-color: var(--indigo-600);
  }
`;

export const SheetBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 55;
  background: rgba(11, 18, 32, 0.45);
  display: flex;
  align-items: flex-end;
`;

export const SheetSurface = styled.div`
  background: #fff;
  width: 100%;
  border-top-left-radius: 24px;
  border-top-right-radius: 24px;
  padding: 10px 16px calc(28px + env(safe-area-inset-bottom));
  box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.15);
  max-height: 88dvh;
  overflow-y: auto;
`;

export const SheetGrabber = styled.div`
  width: 36px;
  height: 5px;
  border-radius: 3px;
  background: var(--ink-200);
  margin: 4px auto 12px;
`;

export const SheetTitle = styled.div`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 20px;
  font-weight: 500;
  color: var(--fg-1);
  letter-spacing: -0.01em;
  margin-bottom: 14px;
`;
