import styled from 'styled-components';

/**
 * Shared danger-toned inline banner for form/page errors.
 *
 * Replaces 7 duplicate ErrorBanner styled-components across auth pages,
 * signing flow pages, and overlays. Each consumer previously defined the
 * identical `danger[50] / danger[500] / danger[700]` token set.
 *
 * Margin is intentionally omitted — callers should apply spacing via the
 * parent layout or a wrapper, keeping the component composable.
 *
 * Usage:
 * ```tsx
 * {error ? <ErrorBanner role="alert">{error}</ErrorBanner> : null}
 * ```
 */
export const ErrorBanner = styled.div`
  padding: 10px 12px;
  background: ${({ theme }) => theme.color.danger[50]};
  border: 1px solid ${({ theme }) => theme.color.danger[500]};
  color: ${({ theme }) => theme.color.danger[700]};
  font-size: ${({ theme }) => theme.font.size.caption};
  border-radius: ${({ theme }) => theme.radius.sm};
`;
