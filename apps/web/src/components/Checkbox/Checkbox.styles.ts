import styled from 'styled-components';

export const Root = styled.label<{ $disabled: boolean; $compact: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space[3]};
  min-height: calc(${({ theme }) => theme.space[10]} + ${({ theme }) => theme.space[1]});
  padding: ${({ theme }) => theme.space[2]} 0;
  font-family: ${({ theme }) => theme.font.sans};
  cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
  opacity: ${({ $disabled }) => ($disabled ? 0.6 : 1)};

  ${({ $compact, theme }) =>
    $compact
      ? `
    gap: ${theme.space[2]};
    & > input {
      width: 16px;
      height: 16px;
      border-radius: ${theme.radius.xxs};
    }
    & > input::after {
      width: 8px;
      height: 4px;
    }
    & span[id] {
      font-size: ${theme.font.size.bodySm};
    }
  `
      : ''}
`;

export const Input = styled.input`
  appearance: none;
  flex-shrink: 0;
  width: ${({ theme }) => theme.space[5]};
  height: ${({ theme }) => theme.space[5]};
  margin: 2px 0 0;
  /* ink-500 (~4.8:1 on paper): the ink-300 box edge was ~1.5:1, below the
     3:1 a control boundary needs. */
  border: 1.5px solid ${({ theme }) => theme.color.ink[500]};
  border-radius: ${({ theme }) => theme.radius.xs};
  background: ${({ theme }) => theme.color.paper};
  display: grid;
  place-content: center;
  cursor: inherit;
  transition:
    background ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard},
    border-color ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard};

  &::after {
    content: '';
    width: 10px;
    height: 6px;
    border-left: 2px solid ${({ theme }) => theme.color.accent.ink};
    border-bottom: 2px solid ${({ theme }) => theme.color.accent.ink};
    transform: translateY(-1px) rotate(-45deg);
    opacity: 0;
  }

  &:checked {
    background: ${({ theme }) => theme.color.indigo[600]};
    border-color: ${({ theme }) => theme.color.indigo[600]};
  }

  &:checked::after {
    opacity: 1;
  }
`;

export const Text = styled.span`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

export const LabelText = styled.span`
  font-size: ${({ theme }) => theme.font.size.body};
  color: ${({ theme }) => theme.color.fg[1]};
  line-height: ${({ theme }) => theme.font.lineHeight.snug};
`;

export const Hint = styled.span`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[3]};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
`;
