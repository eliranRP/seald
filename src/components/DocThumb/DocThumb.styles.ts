import styled from 'styled-components';

export const Thumb = styled.div<{ $size: number }>`
  width: ${({ $size }) => `${$size * 0.77}px`};
  height: ${({ $size }) => `${$size}px`};
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.sm};
  position: relative;
  box-shadow: ${({ theme }) => theme.shadow.paper};
  flex-shrink: 0;
`;

export const Line = styled.div<{ $top: number; $width: number }>`
  position: absolute;
  left: 5px;
  top: ${({ $top }) => `${$top}px`};
  width: ${({ $width }) => `${$width}%`};
  height: 2px;
  background: ${({ theme }) => theme.color.ink[200]};
  border-radius: 1px;
`;

export const Signed = styled.span`
  position: absolute;
  right: 4px;
  bottom: 4px;
  font-family: ${({ theme }) => theme.font.script};
  font-size: 10px;
  color: ${({ theme }) => theme.color.indigo[600]};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
`;
