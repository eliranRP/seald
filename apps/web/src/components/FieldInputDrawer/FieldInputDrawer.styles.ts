import styled from 'styled-components';

export const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  /* Bind the backdrop to the visual viewport on iOS Safari so the soft
     keyboard's appearance shrinks the available area instead of pushing
     the bottom sheet offscreen. \`dvh\` (dynamic) reflects the browser
     chrome AND keyboard; \`svh\` is the safe fallback. \`100vh\` alone
     was the bug — the sheet's footer sat under the iOS keyboard. */
  height: 100vh;
  height: 100svh;
  height: 100dvh;
  background: rgba(11, 18, 32, 0.32);
  z-index: ${({ theme }) => theme.z.modal};
  display: flex;
  align-items: flex-end;
  justify-content: center;
`;

export const Sheet = styled.div`
  width: 100%;
  max-width: 560px;
  /* Cap the sheet to the visual viewport so the footer (Apply / Cancel)
     stays reachable when content + keyboard would otherwise overflow.
     \`overflow-y: auto\` lets the user scroll inside the sheet rather
     than the page jumping. */
  max-height: 100dvh;
  overflow-y: auto;
  box-sizing: border-box;
  background: ${({ theme }) => theme.color.paper};
  border-radius: ${({ theme }) => `${theme.radius.xl} ${theme.radius.xl} 0 0`};
  /* Canvas \`.sheet\` (8 16 24), plus the iPhone home indicator strip;
     \`env(safe-area-inset-bottom)\` is 0 on devices without a notch. */
  padding: ${({ theme }) => theme.space[2]} ${({ theme }) => theme.space[4]}
    calc(${({ theme }) => theme.space[6]} + env(safe-area-inset-bottom, 0px));
  box-shadow: ${({ theme }) => theme.shadow.xl};
`;

/** Canvas `.sheet-handle`: decorative grab bar. */
export const Handle = styled.div`
  width: 36px;
  height: 4px;
  margin: 4px auto 12px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.ink[300]};
`;

export const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0 ${({ theme }) => theme.space[3]} ${({ theme }) => theme.space[1]};
`;

/** Canvas `.h3`: 16px semibold. */
export const Title = styled.div`
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.body};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  color: ${({ theme }) => theme.color.fg[1]};
`;

/** Canvas ghost icon button, 44 x 44. */
export const CloseBtn = styled.button`
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: ${({ theme }) => theme.radius.md};
  background: transparent;
  cursor: pointer;
  color: ${({ theme }) => theme.color.fg[2]};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  &:hover {
    background: ${({ theme }) => theme.color.bg.subtle};
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

/** Canvas `.field` at the 44px sheet height. */
export const Input = styled.input<{ readonly $invalid: boolean }>`
  width: 100%;
  height: 44px;
  padding: 0 ${({ theme }) => theme.space[3]};
  border: 1px solid
    ${({ theme, $invalid }) => ($invalid ? theme.color.danger[500] : theme.color.border[1])};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.paper};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-family: ${({ theme }) => theme.font.sans};
  color: ${({ theme }) => theme.color.fg[1]};
  box-sizing: border-box;
  &::placeholder {
    color: ${({ theme }) => theme.color.ink[500]};
  }
  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.color.indigo[500]};
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const ErrorText = styled.div`
  margin-top: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.danger[700]};
`;

export const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.space[2]};
  margin-top: ${({ theme }) => theme.space[3]};

  @media (max-width: 640px) {
    & > * {
      flex: 1;
    }
  }
`;

/** Canvas `.btn.btn-ghost`. */
export const CancelBtn = styled.button`
  height: 44px;
  padding: 0 18px;
  border: 0;
  border-radius: ${({ theme }) => theme.radius.md};
  background: transparent;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[2]};
  cursor: pointer;
  &:hover {
    background: ${({ theme }) => theme.color.bg.subtle};
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

/** Canvas `.btn.btn-primary`. */
export const ApplyBtn = styled.button`
  height: 44px;
  padding: 0 18px;
  border: none;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.indigo[600]};
  color: ${({ theme }) => theme.color.fgOnAccent};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;
  &:hover {
    background: ${({ theme }) => theme.color.indigo[700]};
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
