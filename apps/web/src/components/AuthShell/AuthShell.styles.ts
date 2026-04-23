import styled from 'styled-components';

export const Root = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.color.ink[50]};
  display: flex;
  font-family: ${({ theme }) => theme.font.sans};
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const FormSide = styled.div`
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  min-width: 0;
`;

export const FormWrap = styled.div`
  width: 100%;
  max-width: 420px;
`;
