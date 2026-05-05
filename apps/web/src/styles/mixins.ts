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
