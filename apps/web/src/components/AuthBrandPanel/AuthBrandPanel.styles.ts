import styled from 'styled-components';

/**
 * The <aside> root. A fixed-proportion editorial column rendered on the left
 * of the auth pages (sign-in / sign-up). Uses ink-900 as the background and
 * layers two soft radial glows behind the content for depth.
 *
 * The panel hides itself below 960px so auth pages can collapse to a single
 * centered form without consumers having to know anything about the panel.
 */
export const Root = styled.aside`
  position: relative;
  overflow: hidden;
  flex: 0 0 44%;
  min-width: 380px;
  max-width: 620px;
  background: ${({ theme }) => theme.color.ink[900]};
  color: ${({ theme }) => theme.color.paper};
  padding: 56px 56px 40px 56px;
  display: flex;
  flex-direction: column;
  isolation: isolate;

  @media (max-width: 960px) {
    display: none;
  }
`;

/**
 * Decorative radial glow layers. `pointer-events: none` so they never
 * intercept clicks; `aria-hidden` is set on the JSX element. Two glows:
 * a warm indigo bloom top-right, a softer pink bloom bottom-left.
 */
export const GlowTopRight = styled.div`
  position: absolute;
  top: -120px;
  right: -120px;
  width: 440px;
  height: 440px;
  pointer-events: none;
  background: radial-gradient(
    circle at center,
    rgba(99, 102, 241, 0.38) 0%,
    rgba(99, 102, 241, 0) 70%
  );
  z-index: 0;
`;

export const GlowBottomLeft = styled.div`
  position: absolute;
  bottom: -160px;
  left: -160px;
  width: 480px;
  height: 480px;
  pointer-events: none;
  background: radial-gradient(
    circle at center,
    rgba(236, 72, 153, 0.22) 0%,
    rgba(236, 72, 153, 0) 70%
  );
  z-index: 0;
`;

/** Content stack sits above the glows. */
export const Content = styled.div`
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
`;

export const Wordmark = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 20px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.paper};
  letter-spacing: -0.01em;
`;

export const WordmarkMark = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.indigo[500]};
  color: ${({ theme }) => theme.color.paper};
`;

export const Heading = styled.h1`
  margin: 96px 0 0 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 46px;
  font-weight: ${({ theme }) => theme.font.weight.medium};
  line-height: 1.08;
  letter-spacing: -0.02em;
  color: ${({ theme }) => theme.color.paper};

  em {
    font-style: italic;
    color: ${({ theme }) => theme.color.indigo[200]};
  }
`;

export const Statement = styled.p`
  margin: ${({ theme }) => theme.space[8]} 0 0;
  max-width: 440px;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-style: normal;
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  color: ${({ theme }) => theme.color.paper};
`;

/** Spacer absorbs any remaining vertical space before the trust footer. */
export const Spacer = styled.div`
  flex: 1;
  min-height: 24px;
`;

export const TrustFooter = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 12px;
  color: rgba(255, 255, 255, 0.48);
  margin-top: 40px;
`;
