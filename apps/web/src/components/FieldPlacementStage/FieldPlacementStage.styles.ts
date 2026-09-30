import styled from 'styled-components';

export const Stack = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
`;

export const Page = styled.div`
  position: relative;
  background: ${({ theme }) => theme.color.paper};
  box-shadow: ${({ theme }) => theme.shadow.paper};
  border-radius: ${({ theme }) => theme.radius.xs};
  overflow: hidden;
`;

export const Box = styled.div`
  position: absolute;
  box-sizing: border-box;
  border: 1.5px solid ${({ theme }) => theme.color.indigo[600]};
  background: ${({ theme }) => theme.color.indigo[50]};
  color: ${({ theme }) => theme.color.indigo[800]};
  font-size: 10px;
  line-height: 1.2;
  padding: 2px 4px;
  pointer-events: none;
  overflow: hidden;
`;
