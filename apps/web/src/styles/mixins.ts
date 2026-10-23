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
