import styled from 'styled-components';

export const Root = styled.button`
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(${({ theme }) => theme.space[10]} + ${({ theme }) => theme.space[1]});
  height: calc(${({ theme }) => theme.space[10]} + ${({ theme }) => theme.space[1]});
  padding: 0;
  border: 0;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: transparent;
  color: ${({ theme }) => theme.color.fg[2]};
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.color.bg.subtle};
  }
`;

export const Badge = styled.span`
  position: absolute;
  top: ${({ theme }) => theme.space[1]};
  right: ${({ theme }) => theme.space[1]};
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.danger[500]};
  color: ${({ theme }) => theme.color.fg.inverse};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.micro};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  line-height: 18px;
  text-align: center;
`;
