import styled from 'styled-components';

/** Canvas `.btn.btn-google`: 44px, 18px side padding, 18px G mark 8px from the label. */
export const GoogleButtonRoot = styled.button<{ $fullWidth: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  gap: 8px;
  height: 44px;
  padding: 0 18px;
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.md};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  line-height: 1;
  white-space: nowrap;
  color: ${({ theme }) => theme.color.fg[1]};
  cursor: pointer;
  width: ${({ $fullWidth }) => ($fullWidth ? '100%' : 'auto')};
  transition:
    border-color 120ms,
    background 120ms;

  &:hover:not(:disabled):not([aria-busy='true']) {
    background: ${({ theme }) => theme.color.bg.subtle};
  }

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }

  &:disabled,
  &[aria-busy='true'] {
    opacity: 0.5;
    cursor: default;
  }

  /* Phone auth screens use the 48px row height. */
  @media (max-width: 640px) {
    height: 48px;
  }
`;

export const Spinner = styled.span`
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(0, 0, 0, 0.2);
  border-top-color: ${({ theme }) => theme.color.ink[900]};
  animation: googleBtnSpin 800ms linear infinite;

  @keyframes googleBtnSpin {
    to {
      transform: rotate(360deg);
    }
  }
`;
