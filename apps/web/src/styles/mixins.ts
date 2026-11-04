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
/**
 * Native `<select>` / `<input>` styling that matches the shared TextField:
 * hairline `border[1]`, 12px radius, 14px text (16px on phones so iOS never
 * zooms), 40px tall (44px on phones), indigo focus ring. Use it for native
 * controls that cannot be a TextField (selects, number inputs).
 */
export const nativeControl = css`
  box-sizing: border-box;
  width: 100%;
  min-height: 40px;
  padding: 0 ${({ theme }) => theme.space[3]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  background-color: ${({ theme }) => theme.color.paper};
  color: ${({ theme }) => theme.color.fg[1]};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.regular};
  outline: none;
  &:focus-visible {
    border-color: ${({ theme }) => theme.color.indigo[500]};
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
  &:disabled {
    background-color: ${({ theme }) => theme.color.bg.app};
    color: ${({ theme }) => theme.color.fg[4]};
    cursor: not-allowed;
  }
  @media (max-width: 640px) {
    min-height: 44px;
    font-size: ${({ theme }) => theme.font.size.body};
  }
`;
