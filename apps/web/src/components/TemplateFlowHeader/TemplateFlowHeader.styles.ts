import styled, { css } from 'styled-components';

const MOBILE = '@media (max-width: 640px)';

/** Top bar of the template editor (canvas `.flowbar`): close, name, pill, actions. */
export const Bar = styled.header`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[6]}`};
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
  background: ${({ theme }) => theme.color.paper};
  ${MOBILE} {
    gap: ${({ theme }) => theme.space[2]};
    padding: ${({ theme }) => `${theme.space[2]} ${theme.space[3]}`};
  }
`;

export const NameBlock = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

export const Meta = styled.span`
  padding: 0 10px;
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.fg[3]};
  ${MOBILE} {
    display: none;
  }
`;

export const ModePill = styled.span`
  display: inline-flex;
  align-items: center;
  flex: none;
  height: 28px;
  padding: 0 ${({ theme }) => theme.space[3]};
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.ink[900]};
  color: ${({ theme }) => theme.color.fgOnAccent};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  white-space: nowrap;
`;

export const NameButton = styled.button<{ $editable: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]};
  align-self: flex-start;
  min-width: 0;
  max-width: 100%;
  padding: 4px 10px;
  border: 1px solid transparent;
  border-radius: ${({ theme }) => theme.radius.md};
  background: transparent;
  font: inherit;
  font-size: ${({ theme }) => theme.font.size.bodyMd};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  cursor: ${({ $editable }) => ($editable ? 'text' : 'default')};

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
      &:focus-visible {
        outline: 0;
        box-shadow: ${theme.shadow.focus};
      }
    `}
`;

export const NameInput = styled.input`
  align-self: flex-start;
  min-width: 240px;
  max-width: 100%;
  padding: 4px 10px;
  border: 1px solid ${({ theme }) => theme.color.indigo[600]};
  border-radius: ${({ theme }) => theme.radius.md};
  outline: none;
  box-shadow: ${({ theme }) => theme.shadow.focus};
  font: inherit;
  font-size: ${({ theme }) => theme.font.size.bodyMd};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  ${MOBILE} {
    min-width: 0;
  }
`;

export const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  flex: none;
`;
