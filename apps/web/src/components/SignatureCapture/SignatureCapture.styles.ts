import styled, { css } from 'styled-components';

/** Signature pad (canvas `.sig-pad`): paper, hairline, baseline rule. */
export const Pad = styled.div<{ readonly $draw?: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 140px;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.paper};
  overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    left: 24px;
    right: 24px;
    bottom: 32px;
    height: 1px;
    background: ${({ theme }) => theme.color.border[2]};
    pointer-events: none;
  }

  ${({ $draw }) =>
    $draw
      ? css`
          display: block;
        `
      : ''}
`;

export const Ink = styled.span<{ readonly $initials: boolean }>`
  max-width: 100%;
  padding: 0 24px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ${({ theme }) => theme.font.script};
  font-size: ${({ theme, $initials }) => ($initials ? theme.font.size.code : theme.font.size.x5l)};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const NameField = styled.label`
  display: flex;
  align-items: center;
  height: 44px;
  padding: 0 14px;
  border: 1px solid ${({ theme }) => theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.paper};

  &:focus-within {
    border-color: ${({ theme }) => theme.color.indigo[600]};
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }

  input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    font: inherit;
    font-size: ${({ theme }) => theme.font.size.bodyMd};
    color: ${({ theme }) => theme.color.fg[1]};
  }
`;

export const PadClear = styled.div`
  position: absolute;
  top: 8px;
  right: 8px;
`;

export const DrawCanvas = styled.canvas`
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: crosshair;
`;

export const DrawHint = styled.div`
  margin-top: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const UploadArea = styled.div`
  padding: ${({ theme }) => theme.space[6]};
  background: ${({ theme }) => theme.color.ink[50]};
  border: 1.5px dashed ${({ theme }) => theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.md};
  min-height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 10px;
  text-align: center;
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Meta = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;
