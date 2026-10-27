import { css } from 'styled-components';

/**
 * Single-line text truncation with ellipsis.
 *
 * Replaces 35+ inline `white-space: nowrap; overflow: hidden;
 * text-overflow: ellipsis;` blocks spread across the codebase.
 *
 * Usage in a styled-component:
 * ```ts
 * const Name = styled.span`
 *   ${truncateText}
 *   max-width: 200px;
 * `;
 * ```
 */
export const truncateText = css`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

/**
 * Hide content visually while keeping it in the accessibility tree
 * (screen-reader-only text).
 */
export const visuallyHidden = css`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
`;

/** Phone breakpoint shared by the mixins below (matches `useIsMobileViewport`). */
const PHONE = '@media (max-width: 640px)';

/**
 * Text inputs, selects and textareas at 16px on phones. iOS Safari zooms
 * the page on focus for anything smaller (UX rules: tables-and-responsive
 * § 20). Put it after the element's own `font` / `font-size`.
 */
export const mobileInputText = css`
  ${PHONE} {
    font-size: ${({ theme }) => theme.font.size.body};
  }
`;

/**
 * Grow the tap area of a compact control to 44px on touch screens without
 * changing its drawn size (UX rules: tables-and-responsive § 21). A
 * transparent `::after` overlays the hit slop, so mouse layouts stay dense.
 * The host must not use `::after` for anything else.
 */
export const touchTarget = css`
  @media (pointer: coarse) {
    position: relative;
    &::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: max(100%, 44px);
      height: max(100%, 44px);
      translate: -50% -50%;
    }
  }
`;
