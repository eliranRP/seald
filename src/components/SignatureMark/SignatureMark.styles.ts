import styled from 'styled-components';
import type { SignatureMarkTone } from './SignatureMark.types';

export const Mark = styled.div`
  display: inline-block;
`;

export const Script = styled.div<{ $size: number; $tone: SignatureMarkTone }>`
  font-family: ${({ theme }) => theme.font.script};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  font-size: ${({ $size }) => `${$size}px`};
  line-height: 1;
  letter-spacing: 0;
  color: ${({ theme, $tone }) =>
    $tone === 'indigo' ? theme.color.indigo[600] : theme.color.ink[900]};
`;
