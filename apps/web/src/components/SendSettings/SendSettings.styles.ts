import styled from 'styled-components';
import { nativeControl } from '@/styles/mixins';

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
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Field = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space[1]};
`;

export const Label = styled.label`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const Control = styled.select`
  ${nativeControl}
`;

export const NumberControl = styled.input`
  ${nativeControl}
`;

export const Hint = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.fg[3]};
`;
