import styled from 'styled-components';

export const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
  font-family: ${({ theme }) => theme.font.sans};
`;

export const Label = styled.label`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const InputWrap = styled.div`
  position: relative;
`;

export const IconSlot = styled.span`
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: ${({ theme }) => theme.color.fg[3]};
  pointer-events: none;
`;

export const Input = styled.input<{ $hasIcon: boolean; $invalid: boolean }>`
  width: 100%;
  padding: ${({ $hasIcon }) => ($hasIcon ? '11px 14px 11px 36px' : '11px 14px')};
  border: 1px solid
    ${({ theme, $invalid }) => ($invalid ? theme.color.danger[500] : theme.color.border[1])};
  border-radius: ${({ theme }) => theme.radius.md};
  font: ${({ theme }) =>
    `${theme.font.weight.regular} ${theme.font.size.bodySm} ${theme.font.sans}`};
  background: ${({ theme }) => theme.color.paper};
  color: ${({ theme }) => theme.color.fg[1]};
  outline: none;
  transition:
    border-color ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard},
    box-shadow ${({ theme }) => theme.motion.durBase} ${({ theme }) => theme.motion.easeStandard};
  &:focus-visible {
    border-color: ${({ theme }) => theme.color.indigo[500]};
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
  &:disabled {
    background: ${({ theme }) => theme.color.bg.app};
    color: ${({ theme }) => theme.color.fg[4]};
    cursor: not-allowed;
  }
`;

export const HelpText = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const ErrorText = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.color.danger[700]};
`;
