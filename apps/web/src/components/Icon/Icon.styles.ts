import styled from 'styled-components';

export const IconRoot = styled.span<{ $size: number }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: ${({ $size }) => `${$size}px`};
  height: ${({ $size }) => `${$size}px`};
  color: currentColor;
  flex-shrink: 0;
  line-height: 0;
`;
