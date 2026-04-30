import styled from 'styled-components';

/**
 * Centered modal-style popover. The design guide anchors this to a
 * card; we render it as a centered overlay so it works at any
 * viewport without anchor-positioning math.
 */
export const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: ${({ theme }) => theme.z.modal};
  background: rgba(15, 23, 42, 0.32);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 96px 24px 24px;
`;

export const Card = styled.div`
  width: 320px;
  max-width: 100%;
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: 12px;
  box-shadow: ${({ theme }) => theme.shadow.lg};
  padding: 10px;
`;

export const SearchRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px 8px;
  border-bottom: 1px solid ${({ theme }) => theme.color.border[2]};

  & > input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    font-size: 12.5px;
    color: ${({ theme }) => theme.color.fg[1]};
    font-family: inherit;
  }
`;

export const List = styled.div`
  max-height: 220px;
  overflow-y: auto;
  padding-top: 6px;
`;

export const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 6px;
  border-radius: 6px;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    background: ${({ theme }) => theme.color.ink[100]};
  }
`;

export const RowCheck = styled.span<{ $checked: boolean; $color: string }>`
  width: 14px;
  height: 14px;
  border-radius: 4px;
  border: 1.5px solid
    ${({ $checked, $color, theme }) => ($checked ? $color : theme.color.border[1])};
  background: ${({ $checked, $color, theme }) => ($checked ? $color : theme.color.paper)};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.color.fg.inverse};
  flex-shrink: 0;
`;

export const RowPill = styled.span<{ $bg: string; $fg: string }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-weight: ${({ theme }) => theme.font.weight.bold};
  letter-spacing: 0.02em;
  padding: 2px 7px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ $bg }) => $bg};
  color: ${({ $fg }) => $fg};
`;

export const RowDot = styled.span<{ $color: string }>`
  width: 6px;
  height: 6px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ $color }) => $color};
`;

export const Empty = styled.div`
  padding: 10px 6px;
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  text-align: center;
`;

export const CreateRow = styled.div`
  margin-top: 6px;
  padding: 7px 8px;
  border-top: 1px solid ${({ theme }) => theme.color.border[2]};
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  border-radius: 6px;
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[1]};
  font-weight: ${({ theme }) => theme.font.weight.semibold};

  &:hover,
  &:focus-visible {
    background: ${({ theme }) => theme.color.indigo[50]};
  }
`;
