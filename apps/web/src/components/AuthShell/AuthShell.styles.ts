import styled from 'styled-components';

export const Root = styled.div`
  /* 100dvh (dynamic viewport height) so iOS Safari doesn't trap the form
     under the dynamic toolbar -- 100vh measures the largest viewport
     and the soft keyboard would push the password input below the fold. */
  min-height: 100dvh;
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

  /* On phones the soft keyboard re-covers a vertically-centered form;
     anchor to the top so the focused input reveals above the keyboard
     and leaves the form's helper text visible. */
  @media (max-width: 640px) {
    justify-content: flex-start;
    padding-top: 64px;
  }
`;

export const FormWrap = styled.div`
  width: 100%;
  max-width: 420px;
`;

export const FootRow = styled.footer`
  margin-top: 32px;
  width: 100%;
  @media (max-width: 640px) {
    margin-top: 24px;
  }
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

/**
 * Footer-row button styled to look identical to the surrounding anchors.
 * Used for the cookie-preferences re-opener so it visually peers with the
 * legal links while still being a real <button> for accessibility.
 */
export const FootLinkButton = styled.button`
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  font: inherit;
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
  &:hover,
  &:focus-visible {
    color: ${({ theme }) => theme.color.fg[1]};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent.base};
    outline-offset: 2px;
    border-radius: 2px;
  }
`;
