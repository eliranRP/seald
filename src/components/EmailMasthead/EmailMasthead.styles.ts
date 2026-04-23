import styled from 'styled-components';

export const Root = styled.div`
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  padding: ${({ theme }) => theme.space[5]};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h5};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Mark = styled.div`
  width: 32px;
  height: 32px;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.indigo[600]};
  color: ${({ theme }) => theme.color.fg.inverse};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 14px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
`;
