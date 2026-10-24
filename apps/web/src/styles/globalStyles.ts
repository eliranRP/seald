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
  :focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 2px;
  }

  /* Motion system keyframes (canvas seald.css section 31). Referenced only
     through the helpers in styles/motion.ts (MOTION_KEYFRAMES). Only
     opacity + the individual translate / scale properties animate. */
  @keyframes seald-screen-in { from { opacity: 0; translate: 0 12px; } to { opacity: 1; translate: 0 0; } }
  @keyframes seald-fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes seald-rise { from { opacity: 0; translate: 0 8px; } to { opacity: 1; translate: 0 0; } }
  @keyframes seald-pop {
    from { opacity: 0; translate: 0 8px; scale: 0.96; }
    to { opacity: 1; translate: 0 0; scale: 1; }
  }
  @keyframes seald-drop {
    from { opacity: 0; translate: 0 -6px; scale: 0.98; }
    to { opacity: 1; translate: 0 0; scale: 1; }
  }
  @keyframes seald-sheet-up { from { translate: 0 100%; } to { translate: 0 0; } }
  @keyframes seald-toast-in {
    from { opacity: 0; translate: 0 16px; scale: 0.98; }
    to { opacity: 1; translate: 0 0; scale: 1; }
  }
  @keyframes seald-bar-down { from { translate: 0 -100%; } to { translate: 0 0; } }
  @keyframes seald-spring { 0% { opacity: 0; scale: 0.6; } 100% { opacity: 1; scale: 1; } }
  @keyframes seald-ring {
    0% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.35); }
    100% { box-shadow: 0 0 0 10px rgba(79, 70, 229, 0); }
  }
  @keyframes seald-grow-x { from { scale: 0 1; } to { scale: 1 1; } }
  @keyframes seald-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  @keyframes seald-spin { to { rotate: 360deg; } }
  @keyframes seald-new-fade {
    0%, 30% { background-color: ${({ theme }) => theme.color.indigo[50]}; }
    100% { background-color: transparent; }
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.001ms !important;
      animation-delay: 0ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.001ms !important;
    }
  }
`;
