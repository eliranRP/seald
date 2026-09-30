import styled from 'styled-components';

export const Secret = styled.p`
  margin: 0;
  padding: ${({ theme }) => theme.space[3]};
  background: ${({ theme }) => theme.color.bg.sunken};
  border-radius: ${({ theme }) => theme.radius.md};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.caption};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  color: ${({ theme }) => theme.color.fg[1]};
  word-break: break-all;
`;
