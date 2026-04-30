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
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  min-width: 0;
`;

export const FormWrap = styled.div`
  width: 100%;
  max-width: 420px;
`;

export const FootRow = styled.footer`
  margin-top: 32px;
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-wrap: wrap;
  gap: 14px 18px;
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  & a {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  & a:hover,
  & a:focus-visible {
    color: ${({ theme }) => theme.color.fg[1]};
  }
  & a:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent.base};
    outline-offset: 2px;
    border-radius: 2px;
  }
`;
