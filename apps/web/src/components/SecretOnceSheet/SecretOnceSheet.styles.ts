import styled from 'styled-components';

export const Description = styled.p`
  margin: 0 0 ${({ theme }) => theme.space[3]};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[2]};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
`;

export const SecretRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
  margin-bottom: ${({ theme }) => theme.space[4]};
`;

export const Secret = styled.code`
  display: block;
  padding: ${({ theme }) => theme.space[3]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.bg.sunken};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[1]};
  word-break: break-all;
  user-select: all;
`;

export const Extra = styled.div`
  margin-bottom: ${({ theme }) => theme.space[4]};
`;
