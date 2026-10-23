import styled from 'styled-components';

/**
 * A 40x24 track with a 16px knob, in a 44px square tap target. Geometry
 * comes from the 4px space scale, like `ReminderToggle`.
 */
export const Root = styled.label`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-width: calc(${({ theme }) => theme.space[10]} + ${({ theme }) => theme.space[1]});
  min-height: calc(${({ theme }) => theme.space[10]} + ${({ theme }) => theme.space[1]});
  cursor: pointer;

  &:has(input[aria-busy='true']) {
    cursor: progress;
  }

  &:has(input:disabled) {
    cursor: not-allowed;
  }
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
  cursor: inherit;
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
    opacity: 0.5;
  }
`;
