import styled from 'styled-components';

export const Section = styled.section`
  display: flex;
  flex-direction: column;
  min-height: 0;
`;

export const Header = styled.h3`
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.color.fg[1]};
  margin: ${({ theme }) => theme.space[1]} 0 10px;
`;

export const EmptyHint = styled.p`
  padding: 14px;
  border: 1px dashed ${({ theme }) => theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.md};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  line-height: 1.5;
  background: ${({ theme }) => theme.color.ink[50]};
  margin: 0;
`;

export const List = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
  min-height: 0;
`;

export const Item = styled.li`
  margin: 0;
  padding: 0;
  list-style: none;
  /* Anchors RowActions, which sits over the right edge of Row so its buttons
     are siblings of the Row button (no <button> inside <button> nesting). */
  position: relative;
`;

/**
 * Absolute-positioned wrapper for the selected-row action buttons. Rendered
 * as a sibling of Row (not a child) so the buttons don't nest inside Row's
 * <button>, which would be invalid DOM.
 */
export const RowActions = styled.div`
  position: absolute;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
  display: inline-flex;
  gap: 4px;
  pointer-events: none;
  /* Re-enable pointer events on each button child so clicks still register. */
  & > * {
    pointer-events: auto;
  }
`;

export const Row = styled.button<{ readonly $selected: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  padding: ${({ theme }) => theme.space[2]} 10px;
  border-radius: 10px;
  background: ${({ $selected, theme }) =>
    $selected ? theme.color.indigo[50] : theme.color.bg.surface};
  border: 1px solid
    ${({ $selected, theme }) => ($selected ? theme.color.indigo[300] : theme.color.border[1])};
  cursor: pointer;
  width: 100%;
  text-align: left;
  appearance: none;
  font: inherit;
  color: inherit;

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const Label = styled.span`
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.color.fg[1]};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const PageTag = styled.span`
  font-size: 10px;
  color: ${({ theme }) => theme.color.fg[3]};
  font-family: ${({ theme }) => theme.font.mono};
  flex-shrink: 0;
`;

export const AvatarStack = styled.span`
  display: inline-flex;
  margin-left: 2px;
  flex-shrink: 0;
`;

export const AvatarChip = styled.span<{ readonly $color: string; readonly $first: boolean }>`
  width: 18px;
  height: 18px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ $color }) => $color};
  color: ${({ theme }) => theme.color.fg.inverse};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 700;
  margin-left: ${({ $first }) => ($first ? '0' : '-5px')};
  border: 1.5px solid ${({ theme }) => theme.color.bg.surface};
  box-sizing: border-box;
`;

/**
 * Inline action buttons rendered on the selected row only — Duplicate and
 * Remove. They sit alongside the page tag / avatars so the user can act on a
 * field from the side rail without needing to hunt the canvas overlay.
 */
export const RowAction = styled.button<{ readonly $tone: 'indigo' | 'danger' }>`
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 0;
  background: ${({ $tone, theme }) =>
    $tone === 'danger' ? theme.color.danger[500] : theme.color.indigo[600]};
  color: ${({ theme }) => theme.color.fg.inverse};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  appearance: none;
  flex-shrink: 0;
  &:hover {
    filter: brightness(1.08);
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;
