import styled from 'styled-components';

export const Root = styled.section`
  display: block;
  width: 100%;
`;

export const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.space[2]};
`;

export const Title = styled.div`
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Count = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const ChipList = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
`;

export const ChipItem = styled.li`
  margin: 0;
  padding: 0;
  list-style: none;
`;

export const Chip = styled.span<{ readonly $clickable: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 4px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  appearance: none;
  font: inherit;
  color: inherit;
  cursor: ${({ $clickable }) => ($clickable ? 'pointer' : 'default')};
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const ChipWrap = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
`;

export const RemoveButton = styled.button`
  width: 18px;
  height: 18px;
  border-radius: ${({ theme }) => theme.radius.pill};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  background: ${({ theme }) => theme.color.bg.surface};
  color: ${({ theme }) => theme.color.fg[2]};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  &:hover {
    color: ${({ theme }) => theme.color.danger[700]};
    border-color: ${({ theme }) => theme.color.danger[500]};
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const Initials = styled.span<{ readonly $color: string }>`
  width: 22px;
  height: 22px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ $color }) => $color};
  color: ${({ theme }) => theme.color.bg.surface};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
`;

export const FirstName = styled.span`
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const AddButton = styled.button`
  width: 30px;
  height: 30px;
  border-radius: ${({ theme }) => theme.radius.pill};
  border: 1.5px dashed ${({ theme }) => theme.color.border[2]};
  background: ${({ theme }) => theme.color.bg.surface};
  color: ${({ theme }) => theme.color.fg[3]};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;
