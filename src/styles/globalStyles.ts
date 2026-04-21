import { createGlobalStyle } from 'styled-components';

export const GlobalStyles = createGlobalStyle`
  *, *::before, *::after { box-sizing: border-box; }
  html, body, #root { height: 100%; }
  body {
    margin: 0;
    font-family: ${({ theme }) => theme.font.sans};
    font-size: ${({ theme }) => theme.font.size.body};
    line-height: ${({ theme }) => theme.font.lineHeight.normal};
    color: ${({ theme }) => theme.color.fg[2]};
    background: ${({ theme }) => theme.color.bg.app};
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  :focus:not(:focus-visible) { outline: none; }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.001ms !important;
      transition-duration: 0.001ms !important;
    }
  }
`;
