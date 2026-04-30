import styled, { css } from 'styled-components';

export const Bar = styled.header`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[5]};
  padding: ${({ theme }) => theme.space[4]} ${({ theme }) => theme.space[8]};
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
  background: ${({ theme }) => theme.color.paper};
`;

export const NameBlock = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
`;

export const ModeBadge = styled.div<{ $tone: 'new' | 'using' }>`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]};
  padding: 4px 10px;
  border-radius: ${({ theme }) => theme.radius.pill};
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  flex-shrink: 0;
  ${({ $tone, theme }) =>
    $tone === 'new'
      ? css`
          background: ${theme.color.success[50]};
          color: ${theme.color.success[700]};
        `
      : css`
          background: ${theme.color.indigo[50]};
          color: ${theme.color.indigo[700]};
        `}
`;

export const NameButton = styled.button<{ $editable: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]};
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.color.fg[1]};
  background: transparent;
  border: 1px solid transparent;
  border-radius: ${({ theme }) => theme.radius.md};
  padding: 6px 10px;
  min-width: 0;
  max-width: 360px;
  cursor: ${({ $editable }) => ($editable ? 'text' : 'default')};
  font-family: inherit;

  & > span:first-child {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  ${({ $editable, theme }) =>
    $editable &&
    css`
      &:hover {
        background: ${theme.color.ink[50]};
        border-color: ${theme.color.border[1]};
      }
    `}
`;

export const NameInput = styled.input`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.color.fg[1]};
  padding: 6px 10px;
  border: 1px solid ${({ theme }) => theme.color.indigo[400]};
  border-radius: ${({ theme }) => theme.radius.md};
  outline: none;
  font-family: inherit;
  min-width: 240px;
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.12);
`;

export const Steps = styled.div`
  display: flex;
  align-items: center;
  gap: 0;
`;

export const StepConnector = styled.span`
  width: 18px;
  height: 1px;
  background: ${({ theme }) => theme.color.border[1]};
`;

export const StepPill = styled.div<{ $active: boolean; $done: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  padding: 6px 12px;
  border-radius: ${({ theme }) => theme.radius.pill};
  font-size: 12px;
  font-weight: 600;
  ${({ $active, $done, theme }) => {
    if ($active) {
      return css`
        background: ${theme.color.ink[900]};
        color: ${theme.color.fg.inverse};
      `;
    }
    if ($done) {
      return css`
        background: transparent;
        color: ${theme.color.success[700]};
      `;
    }
    return css`
      background: transparent;
      color: ${theme.color.fg[3]};
    `;
  }}
`;

export const StepDot = styled.span<{ $active: boolean; $done: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 10px;

  ${({ $active, $done, theme }) => {
    if ($done) {
      return css`
        width: 16px;
        height: 16px;
        border-radius: ${theme.radius.pill};
        background: ${theme.color.success[500]};
        color: ${theme.color.fg.inverse};
      `;
    }
    return css`
      width: 18px;
      height: 18px;
      border-radius: ${theme.radius.pill};
      border: 1.5px solid ${$active ? theme.color.fg.inverse : theme.color.border[2]};
      color: ${$active ? theme.color.fg.inverse : theme.color.fg[3]};
      background: transparent;
    `;
  }}
`;

export const CancelButton = styled.button`
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.color.fg[3]};
  padding: 6px;
  border-radius: ${({ theme }) => theme.radius.md};
  cursor: pointer;
  display: inline-flex;
  align-items: center;

  &:hover,
  &:focus-visible {
    background: ${({ theme }) => theme.color.ink[50]};
    color: ${({ theme }) => theme.color.fg[1]};
  }
`;
