import styled from 'styled-components';

export const Wait = styled.div`
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ theme }) => theme.color.bg.app};
`;

export const Plain = styled.div`
  min-height: 60vh;
`;
