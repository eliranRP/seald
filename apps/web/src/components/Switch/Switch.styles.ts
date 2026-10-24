import styled from 'styled-components';

/**
 * Canvas `.switch-track`: a 36x20 track with a 16px knob inset 2px, in a
 * 44px square tap target.
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
  width: 36px;
  height: 20px;
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
    top: 2px;
    left: 2px;
    width: ${({ theme }) => theme.space[4]};
    height: ${({ theme }) => theme.space[4]};
    border-radius: ${({ theme }) => theme.radius.pill};
    background: ${({ theme }) => theme.color.paper};
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.2);
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

  /* A locked switch that is on reads as fully on; only an off one fades. */
  &:disabled:not(:checked) {
    opacity: 0.5;
  }
`;
