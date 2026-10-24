import styled from 'styled-components';

export const Root = styled.section`
  display: grid;
  gap: ${({ theme }) => theme.space[2]};
  font-family: ${({ theme }) => theme.font.sans};
`;

export const List = styled.ol`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
  margin: 0;
  padding: 0;
  list-style: none;
`;

export const Row = styled.li<{ readonly $dragging: boolean; readonly $dropTarget: boolean }>`
  display: grid;
  gap: ${({ theme }) => theme.space[1]};
  padding: 4px 4px 4px 2px;
  border-radius: ${({ theme }) => theme.radius.sm};
  border: 1px solid
    ${({ theme, $dropTarget }) => ($dropTarget ? theme.color.accent.base : theme.color.border[1])};
  background: ${({ theme }) => theme.color.bg.surface};
  opacity: ${({ $dragging }) => ($dragging ? 0.5 : 1)};
`;

export const Line = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]};
  min-width: 0;
`;

export const Grip = styled.span`
  display: inline-flex;
  flex: none;
  align-items: center;
  color: ${({ theme }) => theme.color.fg[4]};
  cursor: grab;
`;

export const StepTag = styled.span`
  flex: none;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Names = styled.span`
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  flex-direction: column;
`;

export const Name = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: 500;
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Email = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const IconButton = styled.button`
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: ${({ theme }) => theme.radius.xs};
  background: transparent;
  color: ${({ theme }) => theme.color.fg[3]};
  cursor: pointer;
  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.color.bg.subtle};
    color: ${({ theme }) => theme.color.fg[1]};
  }
  &:disabled {
    color: ${({ theme }) => theme.color.fg[4]};
    cursor: not-allowed;
    opacity: 0.5;
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const JoinLabel = styled.label`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  padding-left: ${({ theme }) => theme.space[6]};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[2]};
  cursor: pointer;
`;

export const Hint = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const VisuallyHidden = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
`;

const MOBILE = '@media (max-width: 640px)';

/**
 * Canvas `.switch`: 36×20 track, 16px knob, 14px medium label. Pinned to
 * the Signers header row; on phones the row is a 44px target.
 */
export const CompactSwitch = styled.label`
  position: absolute;
  top: 0;
  right: 0;
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  height: 20px;
  margin: 0;
  cursor: pointer;
  &:has(input:disabled) {
    cursor: not-allowed;
  }
  ${MOBILE} {
    height: 44px;
  }
`;

export const CompactSwitchInput = styled.input`
  appearance: none;
  position: relative;
  flex: none;
  width: 36px;
  height: 20px;
  margin: 0;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.ink[300]};
  cursor: inherit;
  transition: background ${({ theme }) => theme.motion.durFast}
    ${({ theme }) => theme.motion.easeStandard};

  &::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: ${({ theme }) => theme.color.paper};
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.2);
    transition: transform ${({ theme }) => theme.motion.durFast}
      ${({ theme }) => theme.motion.easeStandard};
  }
  &:checked {
    background: ${({ theme }) => theme.color.indigo[600]};
  }
  &:checked::after {
    transform: translateX(16px);
  }
  &:focus-visible {
    outline-color: ${({ theme }) => theme.color.border.focus};
  }
`;

export const CompactSwitchText = styled.span`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[2]};
  white-space: nowrap;
`;
