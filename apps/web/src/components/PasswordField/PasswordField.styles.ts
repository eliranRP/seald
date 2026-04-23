import styled from 'styled-components';

export const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
  font-family: ${({ theme }) => theme.font.sans};
`;

export const LabelRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[2]};
`;

export const Label = styled.label`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const LabelRight = styled.span`
  display: inline-flex;
  align-items: center;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const InputWrap = styled.div`
  position: relative;
`;

export const Input = styled.input<{ $invalid: boolean }>`
  width: 100%;
  padding: 11px 44px 11px 14px;
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

export const EyeToggle = styled.button`
  position: absolute;
  right: 4px;
  top: 4px;
  bottom: 4px;
  width: 36px;
  border: none;
  background: transparent;
  border-radius: ${({ theme }) => theme.radius.xs};
  color: ${({ theme }) => theme.color.fg[3]};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  &:hover {
    color: ${({ theme }) => theme.color.fg[1]};
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
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
