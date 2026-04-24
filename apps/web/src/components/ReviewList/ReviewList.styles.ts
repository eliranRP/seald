import styled from 'styled-components';

export const Root = styled.div`
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  overflow: hidden;
`;

export const Row = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};
  padding: ${({ theme }) => `${theme.space[4]} ${theme.space[5]}`};

  &:not(:last-child) {
    border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
  }
`;

export const IconBadge = styled.div`
  width: 32px;
  height: 32px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.indigo[50]};
  color: ${({ theme }) => theme.color.indigo[700]};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

export const LabelStack = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
`;

export const LabelText = styled.div`
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const PageText = styled.div`
  font-size: ${({ theme }) => theme.font.size.micro};
  color: ${({ theme }) => theme.color.fg[3]};
  margin-top: 2px;
`;

export const ValueSlot = styled.div`
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[2]};
  text-align: right;
  margin-left: auto;
`;
