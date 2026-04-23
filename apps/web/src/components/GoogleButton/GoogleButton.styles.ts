import styled from 'styled-components';

export const GoogleButtonRoot = styled.button<{ $fullWidth: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 46px;
  padding: 0 16px;
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.md};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  cursor: pointer;
  width: ${({ $fullWidth }) => ($fullWidth ? '100%' : 'auto')};
  transition:
    border-color 120ms,
    background 120ms;

  &:hover:not(:disabled):not([aria-busy='true']) {
    border-color: ${({ theme }) => theme.color.ink[400]};
  }

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }

  &:disabled,
  &[aria-busy='true'] {
    opacity: 0.6;
    cursor: default;
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
