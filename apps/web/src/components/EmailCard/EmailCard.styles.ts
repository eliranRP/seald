import styled from 'styled-components';

export const Root = styled.div`
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  padding: ${({ theme }) => theme.space[8]};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[5]};
`;
