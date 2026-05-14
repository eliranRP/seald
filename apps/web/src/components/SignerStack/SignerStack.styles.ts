import styled from 'styled-components';
import { truncateText } from '@/styles/mixins';
import type { SignerStackStatus } from './SignerStack.types';

export const Root = styled.div`
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  min-width: 0;
`;

export const Stack = styled.div`
  display: inline-flex;
  align-items: center;
`;

/**
 * Stacked signer avatar. The previous colored 2 px ring (per status)
 * was visually noisy on the dashboard — five red / amber / indigo
 * rings fighting for attention against the row's Status pill, which
 * already carries the same signal. Dropped to a single neutral
 * `border[1]` so the avatar reads as "person N" and the status lives
 * on the pill.
 *
 * The surface-colored box-shadow stays — when avatars overlap (each
 * `& + &` shifts -8 px), that ring punches a hole through the previous
 * avatar so the silhouettes don't blur together.
 *
 * `$status` is kept on the prop signature even though we don't paint
 * with it any more — callers still pass it (the popover row + tests
 * read it) and styled-components is happy to drop the transient prop
 * without emitting it to the DOM.
 */
export const Avatar = styled.span<{ $status: SignerStackStatus }>`
  width: 28px;
  height: 28px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.indigo[600]};
  color: ${({ theme }) => theme.color.paper};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: 0.02em;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  box-shadow: 0 0 0 2px ${({ theme }) => theme.color.bg.surface};
  position: relative;
  & + & {
    margin-left: -8px;
  }
`;

export const OverflowChip = styled.span`
  width: 28px;
  height: 28px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.ink[100]};
  color: ${({ theme }) => theme.color.fg[2]};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  border: 2px solid ${({ theme }) => theme.color.border[1]};
  box-shadow: 0 0 0 2px ${({ theme }) => theme.color.bg.surface};
  margin-left: -8px;
`;

export const Fraction = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  white-space: nowrap;
`;

// Top/left/position are supplied at the call site via an inline style
// because the popover is portaled to document.body and pinned to the
// trigger's measured viewport rect. Keeping the static styles here so
// styled-components still owns the visual treatment.
export const Popover = styled.div`
  z-index: 10;
  min-width: 240px;
  max-width: 320px;
  padding: ${({ theme }) => theme.space[2]};
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  box-shadow: ${({ theme }) => theme.shadow.lg};
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

export const PopoverRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  padding: ${({ theme }) => `${theme.space[1]} ${theme.space[2]}`};
  border-radius: ${({ theme }) => theme.radius.sm};
  font-size: 12px;
  line-height: 1.3;
  min-width: 0;
  &:hover {
    background: ${({ theme }) => theme.color.ink[50]};
  }
`;

export const PopoverMeta = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
`;

export const PopoverName = styled.span`
  color: ${({ theme }) => theme.color.fg[1]};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  ${truncateText}
`;

export const PopoverEmail = styled.span`
  color: ${({ theme }) => theme.color.fg[3]};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  ${truncateText}
`;
