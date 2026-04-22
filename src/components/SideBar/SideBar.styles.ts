import styled from 'styled-components';

export const Aside = styled.aside`
  width: 240px;
  padding: ${({ theme }) => `${theme.space[4]} ${theme.space[3]}`};
  border-right: 1px solid ${({ theme }) => theme.color.border[1]};
  height: calc(100vh - 56px);
  position: sticky;
  top: 56px;
  background: ${({ theme }) => theme.color.ink[50]};
  overflow-y: auto;
`;

export const PrimaryActionSlot = styled.div`
  & > button {
    width: 100%;
    justify-content: center;
  }
`;

export const TopSpacer = styled.div`
  height: ${({ theme }) => theme.space[5]};
`;

export const SectionSpacer = styled.div`
  height: 28px;
`;

export const NavList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

export const NavListItem = styled.li`
  margin: 0;
  padding: 0;
`;

export const NavItemButton = styled.button<{ readonly $active: boolean }>`
  appearance: none;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  padding: ${({ theme }) => `${theme.space[2]} ${theme.space[3]}`};
  border-radius: 10px;
  margin-bottom: 2px;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 14px;
  font-weight: ${({ $active }) => ($active ? 600 : 500)};
  cursor: pointer;
  background: ${({ $active, theme }) => ($active ? theme.color.bg.surface : 'transparent')};
  border: 1px solid ${({ $active, theme }) => ($active ? theme.color.border[1] : 'transparent')};
  color: ${({ $active, theme }) => ($active ? theme.color.fg[1] : theme.color.fg[2])};
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const NavItemLabel = styled.span`
  flex: 1;
`;

export const NavItemCount = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  font-weight: 500;
`;

export const FolderHeading = styled.div`
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.fg[3]};
  padding: ${({ theme }) => `0 ${theme.space[3]} ${theme.space[2]}`};
`;

export const FolderList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

export const FolderListItem = styled.li`
  margin: 0;
  padding: 0;
`;

export const FolderButton = styled.button<{ readonly $active: boolean }>`
  appearance: none;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  padding: 7px ${({ theme }) => theme.space[3]};
  border-radius: 10px;
  color: ${({ theme }) => theme.color.fg[2]};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 14px;
  cursor: pointer;
  background: ${({ $active, theme }) => ($active ? theme.color.bg.subtle : 'transparent')};
  border: 1px solid transparent;
  &:hover {
    background: ${({ theme }) => theme.color.bg.subtle};
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;
