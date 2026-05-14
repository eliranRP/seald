import styled, { type DefaultTheme } from 'styled-components';
import type { SignerStackStatus } from '../SignerStack';

/**
 * Per-segment fill color. Pending / draft stays `transparent` so the
 * segment reads as "still part of the track" instead of "in progress".
 * The track itself renders in `theme.color.ink[100]`.
 */
export const segmentColor = (t: DefaultTheme, status: SignerStackStatus): string => {
  switch (status) {
    case 'signed':
      return t.color.success[500];
    case 'awaiting-you':
      return t.color.indigo[600];
    case 'declined':
      return t.color.danger[500];
    case 'pending':
    case 'draft':
    default:
      return 'transparent';
  }
};

export const Track = styled.div`
  display: flex;
  gap: 2px;
  width: 100%;
  height: 4px;
  padding: 0;
  background: transparent;
  border-radius: ${({ theme }) => theme.radius.pill};
  overflow: hidden;
`;

/**
 * Empty (pending / draft / declined-without-fill) segments rely on the
 * inset shadow to outline the track since their fill is `transparent`.
 * Bumped from `ink[100]` to `ink[200]` so an empty bar (`0/2 signed`)
 * still has a clear "track" affordance against the surface — the
 * previous contrast was visually invisible at 4 px tall.
 */
export const Segment = styled.span<{ $status: SignerStackStatus }>`
  flex: 1 1 0;
  height: 100%;
  background: ${({ theme, $status }) => segmentColor(theme, $status)};
  background-clip: padding-box;
  border-radius: ${({ theme }) => theme.radius.pill};
  box-shadow: inset 0 0 0 0.5px ${({ theme }) => theme.color.ink[200]};
  transition: background 180ms ease;
`;
