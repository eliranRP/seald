import styled from 'styled-components';

export const InfoChipRoot = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.paper};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[2]};
  white-space: nowrap;
`;
