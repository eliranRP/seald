import styled, { css } from 'styled-components';
import { visuallyHidden } from '@/styles/mixins';

const MOBILE = '@media (max-width: 640px)';

/**
 * Top bar of the template editor (canvas `.flowbar`): a 64px three-column
 * grid, close + name on the left, the mode pill centred, actions right.
 * Phones get the 56px `.m-top`: close, pill, name, then the actions.
 */
export const Bar = styled.header`
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  flex: none;
  height: 64px;
  padding: 0 ${({ theme }) => theme.space[6]};
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
  background: ${({ theme }) => theme.color.paper};
  ${MOBILE} {
    display: flex;
    gap: ${({ theme }) => theme.space[2]};
    height: 56px;
    padding: ${({ theme }) => `0 ${theme.space[2]} 0 ${theme.space[4]}`};
  }
`;

/** Close button + name block (canvas `.row-flex`). */
export const Lead = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  min-width: 0;
  ${MOBILE} {
    /* Let the pill slot in between close and name, as on the board. */
    display: contents;
  }
`;

export const NameBlock = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  ${MOBILE} {
    order: 2;
  }
`;

export const Meta = styled.span`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
  ${MOBILE} {
    display: none;
  }
`;

/** Mode label (canvas `.pill`; the phone bar uses the dark `.is-active` one). */
export const ModePill = styled.span`
  display: inline-flex;
  align-items: center;
  flex: none;
  height: 36px;
  padding: 0 ${({ theme }) => theme.space[3]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.paper};
  color: ${({ theme }) => theme.color.fg[2]};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  white-space: nowrap;
  /* Phone: the 375px bar has no room for a 115px chip next to the name
     (it cut short the template name), so the mode stays for screen
     readers only and the name gets the width. */
  ${MOBILE} {
    ${visuallyHidden}
  }
`;

export const NameButton = styled.button<{ $editable: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]};
  align-self: flex-start;
  min-width: 0;
  max-width: calc(100% + 12px);
  /* Board .h3 (16px / 24px). The rename chip bleeds 6px outward so the
     name lines up with the meta line under it. */
  margin: -1px -7px;
  padding: 0 6px;
  border: 1px solid transparent;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: transparent;
  font: inherit;
  font-size: ${({ theme }) => theme.font.size.body};
  line-height: 24px;
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
  max-width: calc(100% + 12px);
  margin: -1px -7px;
  padding: 0 6px;
  border: 1px solid ${({ theme }) => theme.color.indigo[600]};
  border-radius: ${({ theme }) => theme.radius.sm};
  outline: none;
  box-shadow: ${({ theme }) => theme.shadow.focus};
  font: inherit;
  font-size: ${({ theme }) => theme.font.size.body};
  line-height: 24px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  ${MOBILE} {
    min-width: 0;
  }
`;

export const Actions = styled.div`
  justify-self: end;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  flex: none;
  ${MOBILE} {
    order: 3;
  }
`;
