import styled from 'styled-components';

export const DividerRoot = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  margin: ${({ theme }) => theme.space[5]} 0;
`;

export const Rule = styled.div`
  flex: 1;
  height: 1px;
  background: ${({ theme }) => theme.color.border[1]};
`;

export const Label = styled.span`
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.micro};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[4]};
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;
