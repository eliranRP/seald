import styled from 'styled-components';

/**
 * Switch geometry is the 4px space scale: a 40×24 track, a 16px knob,
 * and a 4px inset. Travel is one space step (40 − 16 − 4 − 4). The row
 * is a 44px target via space[10] + space[1]. The keyboard ring is the
 * global one in globalStyles (2px border.focus / indigo 500, offset 2).
 * This rule only pins the color so a local override cannot use indigo 600.
 */
export const Root = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space[2]};
  min-height: calc(${({ theme }) => theme.space[10]} + ${({ theme }) => theme.space[1]});
  margin: 0;
  padding: 0;
  cursor: pointer;
  font-family: ${({ theme }) => theme.font.sans};
`;

export const Input = styled.input`
  appearance: none;
  width: ${({ theme }) => theme.space[10]};
  height: ${({ theme }) => theme.space[6]};
  margin: 0;
  flex-shrink: 0;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.ink[300]};
  position: relative;
  cursor: pointer;
  transition: background ${({ theme }) => theme.motion.durFast}
    ${({ theme }) => theme.motion.easeStandard};

  &::after {
    content: '';
    position: absolute;
    top: ${({ theme }) => theme.space[1]};
    left: ${({ theme }) => theme.space[1]};
    width: ${({ theme }) => theme.space[4]};
    height: ${({ theme }) => theme.space[4]};
    border-radius: ${({ theme }) => theme.radius.pill};
    background: ${({ theme }) => theme.color.paper};
    transition: transform ${({ theme }) => theme.motion.durFast}
      ${({ theme }) => theme.motion.easeStandard};
  }

  &:checked {
    background: ${({ theme }) => theme.color.accent.base};
  }

  &:checked::after {
    transform: translateX(${({ theme }) => theme.space[4]});
  }

  &:focus-visible {
    outline-color: ${({ theme }) => theme.color.border.focus};
  }

  &:disabled {
    cursor: not-allowed;
  }

  &[aria-busy='true'] {
    cursor: progress;
  }
`;

export const CopyCol = styled.span`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
  padding-top: ${({ theme }) => theme.space[1]};
`;

export const Text = styled.label`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  color: ${({ theme }) => theme.color.fg[1]};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  line-height: ${({ theme }) => theme.font.lineHeight.snug};
`;

export const Copy = styled.span`
  color: ${({ theme }) => theme.color.fg[3]};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.regular};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
`;
