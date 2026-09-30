import styled from 'styled-components';

export const Root = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 16px;
  font-family: ${({ theme }) => theme.font.sans};
`;

export const Label = styled.label`
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  cursor: pointer;
  color: ${({ theme }) => theme.color.fg[1]};
  font-size: 14px;
  font-weight: 600;
`;

export const Input = styled.input`
  width: 18px;
  height: 18px;
  margin: 0;
  flex-shrink: 0;
  accent-color: ${({ theme }) => theme.color.indigo[600]};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.indigo[600]};
    outline-offset: 2px;
  }

  &:disabled {
    cursor: not-allowed;
  }
`;

export const Text = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
`;

export const Copy = styled.p`
  margin: 0 0 0 28px;
  color: ${({ theme }) => theme.color.fg[3]};
  font-size: 12px;
  line-height: 1.4;
`;
