import styled from 'styled-components';

export const TabList = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[1]};
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
`;

export const TabButton = styled.button<{ readonly $active: boolean }>`
  appearance: none;
  background: transparent;
  border: none;
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[4]}`};
  font-size: 14px;
  font-family: ${({ theme }) => theme.font.sans};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ $active, theme }) => ($active ? theme.color.fg[1] : theme.color.fg[3])};
  border-bottom: 2px solid
    ${({ $active, theme }) => ($active ? theme.color.indigo[600] : 'transparent')};
  margin-bottom: -1px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const TabCount = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  background: ${({ theme }) => theme.color.ink[100]};
  padding: 1px 7px;
  border-radius: ${({ theme }) => theme.radius.pill};
  font-weight: ${({ theme }) => theme.font.weight.medium};
`;
