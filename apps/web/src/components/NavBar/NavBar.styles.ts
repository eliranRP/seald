import styled from 'styled-components';

export const Header = styled.header`
  position: sticky;
  top: 0;
  z-index: ${({ theme }) => theme.z.nav};
  height: 56px;
  min-height: 56px;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
  display: flex;
  align-items: center;
  padding: 0 ${({ theme }) => theme.space[6]};
  gap: ${({ theme }) => theme.space[6]};
`;

export const LogoSlot = styled.div`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
`;

/**
 * Rounded indigo square containing the Sealed quill mark. Rendered by default
 * alongside the wordmark so the brand gets a visual anchor, not just text.
 */
export const LogoMark = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.indigo[600]};
  color: ${({ theme }) => theme.color.fg.inverse};
  flex-shrink: 0;
`;

export const DefaultWordmark = styled.span`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h5};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Nav = styled.nav`
  display: flex;
  gap: ${({ theme }) => theme.space[1]};
  margin-left: ${({ theme }) => theme.space[4]};
`;

export const NavItemButton = styled.button<{ readonly $active: boolean }>`
  appearance: none;
  background: transparent;
  border: 1px solid transparent;
  padding: ${({ theme }) => `${theme.space[1]} ${theme.space[3]}`};
  border-radius: ${({ theme }) => theme.radius.sm};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ $active, theme }) => ($active ? theme.color.fg[1] : theme.color.fg[3])};
  cursor: pointer;
  &:hover {
    color: ${({ theme }) => theme.color.fg[1]};
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const NavItemLink = styled.a<{ readonly $active: boolean }>`
  display: inline-flex;
  align-items: center;
  padding: ${({ theme }) => `${theme.space[1]} ${theme.space[3]}`};
  border-radius: ${({ theme }) => theme.radius.sm};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ $active, theme }) => ($active ? theme.color.fg[1] : theme.color.fg[3])};
  text-decoration: none;
  cursor: pointer;
  &:hover {
    color: ${({ theme }) => theme.color.fg[1]};
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const Spacer = styled.div`
  flex: 1;
`;

export const RightCluster = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
`;
