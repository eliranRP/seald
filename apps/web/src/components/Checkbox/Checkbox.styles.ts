import styled from 'styled-components';

export const Label = styled.label`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space[3]};
  min-height: 44px;
  padding: ${({ theme }) => `${theme.space[2]} 0`};
  cursor: pointer;
  color: ${({ theme }) => theme.color.fg[1]};
  font-size: ${({ theme }) => theme.font.size.bodySm};
`;

export const Input = styled.input`
  width: 20px;
  height: 20px;
  margin-top: 2px;
  flex-shrink: 0;
  accent-color: ${({ theme }) => theme.color.indigo[600]};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.indigo[600]};
    outline-offset: 2px;
  }
`;

export const Text = styled.span`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
  line-height: ${({ theme }) => theme.font.lineHeight.snug};
`;

export const Help = styled.span`
  color: ${({ theme }) => theme.color.fg[3]};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.regular};
`;
