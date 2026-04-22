import styled, { css } from 'styled-components';

export const Root = styled.div`
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  padding: ${({ theme }) => theme.space[3]} ${({ theme }) => theme.space[4]};
  background: linear-gradient(
    180deg,
    ${({ theme }) => theme.color.bg.app} 0%,
    ${({ theme }) => theme.color.bg.surface} 100%
  );
  font-family: ${({ theme }) => theme.font.sans};
  display: flex;
  flex-direction: column;
`;

export const StatusLine = styled.div<{ $ready: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  margin-bottom: 10px;
  font-size: 12px;
  color: ${({ theme, $ready }) => ($ready ? theme.color.success[700] : theme.color.fg[3])};
  line-height: 1.4;
`;

export const StatusText = styled.span`
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
`;

export const StatusCount = styled.b`
  color: ${({ theme }) => theme.color.fg[1]};
  font-weight: 700;
`;

export const PrimaryButton = styled.button<{ $enabled: boolean }>`
  width: 100%;
  padding: 14px 18px;
  border-radius: 14px;
  border: none;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 15px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition:
    background 160ms,
    box-shadow 160ms,
    transform 80ms;
  ${({ theme, $enabled }) =>
    $enabled
      ? css`
          background: ${theme.color.indigo[600]};
          color: ${theme.color.fg.inverse};
          cursor: pointer;
          box-shadow: 0 6px 16px rgba(79, 70, 229, 0.28);
          &:active {
            transform: translateY(1px);
          }
        `
      : css`
          background: ${theme.color.ink[200]};
          color: ${theme.color.fg[4]};
          cursor: not-allowed;
          box-shadow: none;
        `}
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const DraftRow = styled.div`
  display: flex;
  justify-content: center;
  margin-top: 10px;
`;

export const DraftButton = styled.button`
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.color.fg[3]};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: ${({ theme }) => theme.radius.xs};
  &:hover {
    color: ${({ theme }) => theme.color.fg[2]};
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;
