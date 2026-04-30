import styled, { css } from 'styled-components';

export const TagFilterAnchor = styled.div`
  position: relative;
`;

export const TagFilterTrigger = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 11px;
  border-radius: 10px;
  font-size: 12.5px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;
  font-family: inherit;
  ${({ $active, theme }) =>
    $active
      ? css`
          background: ${theme.color.indigo[50]};
          border: 1px solid ${theme.color.indigo[300]};
          color: ${theme.color.fg[1]};
        `
      : css`
          background: ${theme.color.paper};
          border: 1px solid ${theme.color.border[1]};
          color: ${theme.color.fg[1]};
        `}
`;

export const TagFilterCount = styled.span`
  padding: 1px 7px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.indigo[600]};
  color: ${({ theme }) => theme.color.fg.inverse};
  font-size: 11px;
  font-family: ${({ theme }) => theme.font.mono};
`;

export const TagFilterPanel = styled.div`
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: ${({ theme }) => theme.z.overlay};
  width: 280px;
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: 12px;
  box-shadow: ${({ theme }) => theme.shadow.lg};
  padding: 10px;
`;

export const TagFilterSearchRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px 8px;
  border-bottom: 1px solid ${({ theme }) => theme.color.border[2]};

  & > input {
    flex: 1;
    border: none;
    outline: none;
    font-size: 12.5px;
    background: transparent;
    color: ${({ theme }) => theme.color.fg[1]};
    font-family: inherit;
  }
`;

export const TagFilterClearButton = styled.button`
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.color.fg[3]};
  font-size: 11.5px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;
  padding: 2px 4px;
  font-family: inherit;
`;

export const TagFilterList = styled.div`
  max-height: 260px;
  overflow-y: auto;
  padding-top: 6px;
`;

export const TagFilterRow = styled.div`
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

export const TagFilterCheck = styled.span<{ $checked: boolean; $color: string }>`
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

export const TagFilterName = styled.span`
  flex: 1;
  font-size: 12.5px;
  color: ${({ theme }) => theme.color.fg[1]};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
`;

export const TagFilterCountBadge = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.color.fg[3]};
  font-family: ${({ theme }) => theme.font.mono};
`;

export const TagFilterEmpty = styled.div`
  padding: 14px 6px;
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  text-align: center;
`;
