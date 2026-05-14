import { forwardRef } from 'react';
import styled from 'styled-components';

/**
 * Slim wordmark rendered ABOVE the `FormSide` form column when the
 * `AuthBrandPanel` is collapsed (i.e. viewports `<= 960px`). Without this,
 * tablets / foldables in the 641-960 px band saw a logo-less form on the
 * `ink-50` background and the page read as a generic sign-in form.
 *
 * Mirrors the wordmark + mark styling used in `AuthBrandPanel.styles.ts`
 * but inverted for the light form column (ink-900 text on light bg).
 * Deliberately hidden above 960 px because the brand panel already
 * carries the wordmark on the desktop split layout.
 */
const Row = styled.div`
  display: none;
  align-items: center;
  gap: 10px;
  margin: 0 0 ${({ theme }) => theme.space[6]};
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 20px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  letter-spacing: -0.01em;

  @media (max-width: 960px) {
    display: inline-flex;
  }
`;

const Mark = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.indigo[500]};
  color: ${({ theme }) => theme.color.paper};
`;

export const AuthMobileHeader = forwardRef<HTMLDivElement>((_, ref) => (
  <Row ref={ref} role="img" aria-label="Seald">
    <Mark aria-hidden="true">
      <svg viewBox="0 0 40 40" width="16" height="16" fill="none" aria-hidden="true">
        <g transform="translate(6, 6)">
          <path
            d="M2 22 C 6 20, 10 14, 14 12 L 22 4 L 26 8 L 18 16 C 16 20, 10 24, 4 26 Z"
            fill="currentColor"
          />
          <path
            d="M22 4 L 24 2 C 25 1, 26.5 1, 27.5 2 L 28 2.5 C 29 3.5, 29 5, 28 6 L 26 8 Z"
            fill="currentColor"
            opacity="0.7"
          />
        </g>
      </svg>
    </Mark>
    <span>Seald</span>
  </Row>
));
AuthMobileHeader.displayName = 'AuthMobileHeader';
