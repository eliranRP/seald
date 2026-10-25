import styled, { type DefaultTheme } from 'styled-components';
import type { SignerStackStatus } from '../SignerStack';

/**
 * Per-segment fill (canvas `.seg-*`): signed green, your turn indigo-300,
 * declined red; pending and draft keep the ink-100 track colour.
 */
export const segmentColor = (t: DefaultTheme, status: SignerStackStatus): string => {
  switch (status) {
    case 'signed':
      return t.color.success[500];
    case 'awaiting-you':
      return t.color.indigo[300];
    case 'declined':
      return t.color.danger[500];
    case 'pending':
    case 'draft':
    default:
      return t.color.ink[100];
  }
};

/** Canvas `.segbar`: a 120px, 4px-tall row of per-signer segments, 3px apart. */
export const Track = styled.div`
  display: flex;
  gap: 3px;
  width: 120px;
  max-width: 100%;
  height: 4px;
  padding: 0;
  background: transparent;
`;

export const Segment = styled.span<{ $status: SignerStackStatus }>`
  flex: 1 1 0;
  height: 100%;
  background: ${({ theme, $status }) => segmentColor(theme, $status)};
  border-radius: ${({ theme }) => theme.radius.pill};
  transition: background 180ms ease;
`;
