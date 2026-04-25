import styled from 'styled-components';

export const Shell = styled.div`
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: ${({ theme }) => theme.color.bg.subtle};
  padding: ${({ theme }) => theme.space[6]};
`;

export const Panel = styled.div`
  max-width: 420px;
  width: 100%;
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  padding: ${({ theme }) => theme.space[6]};
  text-align: center;
`;

export const Title = styled.h1`
  font-size: ${({ theme }) => theme.font.size.h3};
  margin: 0;
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Message = styled.p`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[2]};
  margin-top: ${({ theme }) => theme.space[3]};
  line-height: 1.6;
`;

export const Actions = styled.div`
  margin-top: ${({ theme }) => theme.space[5]};
  display: flex;
  gap: ${({ theme }) => theme.space[2]};
  justify-content: center;
`;
