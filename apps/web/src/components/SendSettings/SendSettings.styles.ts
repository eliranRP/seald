import styled from 'styled-components';

export const Root = styled.fieldset`
  display: grid;
  gap: ${({ theme }) => theme.space[3]};
  margin: 0;
  padding: 0;
  border: 0;
  font-family: ${({ theme }) => theme.font.sans};
`;

export const Legend = styled.legend`
  padding: 0;
  margin-bottom: ${({ theme }) => theme.space[1]};
  font-size: 13px;
  font-weight: 600;
`;

export const Field = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space[1]};
`;

export const Label = styled.label`
  font-size: 13px;
`;

export const Control = styled.select`
  min-height: calc(${({ theme }) => theme.space[10]} + ${({ theme }) => theme.space[1]});
  padding: 0 ${({ theme }) => theme.space[2]};
  font: inherit;
`;

export const NumberControl = styled.input`
  min-height: calc(${({ theme }) => theme.space[10]} + ${({ theme }) => theme.space[1]});
  padding: 0 ${({ theme }) => theme.space[2]};
  font: inherit;
`;

export const Hint = styled.p`
  margin: 0;
  font-size: 12px;
`;
