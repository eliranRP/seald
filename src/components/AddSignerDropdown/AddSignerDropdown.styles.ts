import styled from 'styled-components';

export const Root = styled.div`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 6px;
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  box-shadow: ${({ theme }) => theme.shadow.lg};
  z-index: 30;
  overflow: hidden;
`;

export const SearchWrap = styled.div`
  padding: 10px;
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
`;

export const SearchInput = styled.input`
  width: 100%;
  padding: ${({ theme }) => theme.space[2]} ${({ theme }) => theme.space[3]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.sm};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-family: ${({ theme }) => theme.font.sans};
  color: ${({ theme }) => theme.color.fg[1]};
  background: ${({ theme }) => theme.color.bg.surface};
  outline: none;
  &:focus-visible {
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const List = styled.div`
  max-height: 220px;
  overflow: auto;
`;

export const OptionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: ${({ theme }) => theme.space[2]} ${({ theme }) => theme.space[3]};
  background: transparent;
  border: none;
  text-align: left;
  cursor: pointer;
  font-family: ${({ theme }) => theme.font.sans};
  &:hover {
    background: ${({ theme }) => theme.color.ink[50]};
  }
  &:focus-visible {
    outline: none;
    background: ${({ theme }) => theme.color.ink[50]};
    box-shadow: inset 0 0 0 2px ${({ theme }) => theme.color.border.focus};
  }
`;

export const CheckBox = styled.span<{ $checked: boolean }>`
  width: 18px;
  height: 18px;
  border-radius: ${({ theme }) => theme.radius.sm};
  border: 1.5px solid
    ${({ theme, $checked }) => ($checked ? theme.color.success[500] : theme.color.border[2])};
  background: ${({ theme, $checked }) =>
    $checked ? theme.color.success[500] : theme.color.bg.surface};
  color: ${({ theme }) => theme.color.fg.inverse};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
`;

export const Initials = styled.span<{ $color: string }>`
  width: 24px;
  height: 24px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ $color }) => $color};
  color: ${({ theme }) => theme.color.fg.inverse};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  flex: none;
`;

export const RowBody = styled.span`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
`;

export const Name = styled.span`
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const Email = styled.span`
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const EmptyHint = styled.div`
  padding: 14px 12px;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const CreateFooter = styled.div`
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  padding: 10px;
  background: ${({ theme }) => theme.color.indigo[50]};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
`;

export const CreateHint = styled.span`
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 12px;
  color: ${({ theme }) => theme.color.indigo[800]};
`;
