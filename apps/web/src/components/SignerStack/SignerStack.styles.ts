import styled, { type DefaultTheme } from 'styled-components';
import { truncateText, visuallyHidden } from '@/styles/mixins';
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

/** Canvas `.av-*` soft tints, one per signer status. */
const avatarTone = (t: DefaultTheme, status: SignerStackStatus): { bg: string; fg: string } =>
  ({
    signed: { bg: t.color.success[50], fg: t.color.success[700] },
    pending: { bg: t.color.warn[50], fg: t.color.warn[700] },
    'awaiting-you': { bg: t.color.indigo[50], fg: t.color.indigo[800] },
    declined: { bg: t.color.danger[50], fg: t.color.danger[700] },
    draft: { bg: t.color.ink[100], fg: t.color.ink[600] },
  })[status];

/**
 * Stacked signer avatar (canvas `.avatars > .avatar`): 28px, a soft tint
 * for the signer's status, and a surface-coloured ring so overlapping
 * avatars (each shifted -4px) stay distinct.
 */
export const Avatar = styled.span<{ $status: SignerStackStatus }>`
  width: 28px;
  height: 28px;
  flex: none;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme, $status }) => avatarTone(theme, $status).bg};
  color: ${({ theme, $status }) => avatarTone(theme, $status).fg};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: ${({ theme }) => theme.font.size.badge};
  font-weight: ${({ theme }) => theme.font.weight.bold};
  line-height: 1;
  box-shadow: 0 0 0 2px ${({ theme }) => theme.color.bg.surface};
  position: relative;
  & + & {
    margin-left: -4px;
  }
`;

export const OverflowChip = styled.span`
  width: 28px;
  height: 28px;
  flex: none;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.ink[100]};
  color: ${({ theme }) => theme.color.ink[600]};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: ${({ theme }) => theme.font.size.badge};
  font-weight: ${({ theme }) => theme.font.weight.bold};
  line-height: 1;
  box-shadow: 0 0 0 2px ${({ theme }) => theme.color.bg.surface};
  margin-left: -4px;
`;

/**
 * "n/m signed". The design shows progress with the segment bar alone, so
 * the fraction is kept for screen readers only.
 */
export const Fraction = styled.span`
  ${visuallyHidden}
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
