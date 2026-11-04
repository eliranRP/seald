import styled, { css } from 'styled-components';

const MOBILE = '@media (max-width: 640px)';

export const Header = styled.header`
  position: sticky;
  top: 0;
  z-index: ${({ theme }) => theme.z.nav};
  flex: none;
  height: 64px;
  min-height: 64px;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[6]};
  padding: 0 ${({ theme }) => theme.space[8]};
  background: ${({ theme }) => theme.color.paper};
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
  ${MOBILE} {
    height: 56px;
    min-height: 56px;
    gap: ${({ theme }) => theme.space[2]};
    padding: 0 ${({ theme }) => theme.space[2]} 0 ${({ theme }) => theme.space[4]};
  }
`;

export const LogoSlot = styled.div`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
`;

/** Indigo rounded square with the script "S" (canvas `.logo-mark`). */
export const LogoMark = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.indigo[600]};
  color: ${({ theme }) => theme.color.fgOnAccent};
  font-family: ${({ theme }) => theme.font.script};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  font-size: ${({ theme }) => theme.font.size.xl};
  line-height: 1;
`;

export const DefaultWordmark = styled.span`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.xl};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Nav = styled.nav`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  ${MOBILE} {
    display: none;
  }
`;

const navLinkStyles = css`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  height: 36px;
  padding: 0 ${({ theme }) => theme.space[3]};
  border: 0;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: transparent;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[2]};
  text-decoration: none;
  cursor: pointer;
  transition:
    background-color ${({ theme }) => theme.motion.durFast}
      ${({ theme }) => theme.motion.easeStandard},
    color ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard};
  &:hover {
    background: ${({ theme }) => theme.color.bg.subtle};
  }
  &[aria-current='page'] {
    background: ${({ theme }) => theme.color.indigo[50]};
    color: ${({ theme }) => theme.color.indigo[800]};
    font-weight: ${({ theme }) => theme.font.weight.semibold};
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const NavItemButton = styled.button`
  appearance: none;
  ${navLinkStyles}
`;

export const NavItemLink = styled.a`
  ${navLinkStyles}
`;

export const Spacer = styled.div`
  flex: 1;
`;

export const RightCluster = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
`;

/** Ghost icon button (canvas `.btn-ghost.btn-icon`) linking to help. */
export const HelpLink = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: ${({ theme }) => theme.radius.md};
  color: ${({ theme }) => theme.color.fg[2]};
  transition: background-color ${({ theme }) => theme.motion.durFast}
    ${({ theme }) => theme.motion.easeStandard};
  &:hover {
    background: ${({ theme }) => theme.color.bg.subtle};
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
  ${MOBILE} {
    display: none;
  }
`;

/**
 * "Guest mode" pill rendered after the logo. Purely informational — the
 * actual upgrade CTAs live in the RightCluster.
 */
export const GuestChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  padding: ${({ theme }) => `${theme.space[1]} ${theme.space[3]}`};
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.ink[100]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  color: ${({ theme }) => theme.color.fg[2]};
  font-size: ${({ theme }) => theme.font.size.micro};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: 0.01em;
  ${MOBILE} {
    display: none;
  }
`;

export const GhostButton = styled.button`
  appearance: none;
  height: 36px;
  padding: 0 ${({ theme }) => theme.space[4]};
  border: none;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: transparent;
  color: ${({ theme }) => theme.color.fg[2]};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;
  &:hover {
    background: ${({ theme }) => theme.color.bg.subtle};
    color: ${({ theme }) => theme.color.fg[1]};
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
  @media (pointer: coarse) {
    height: 44px;
  }
`;

export const PrimaryButton = styled.button`
  appearance: none;
  height: 36px;
  padding: 0 ${({ theme }) => theme.space[4]};
  border: none;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.indigo[600]};
  color: ${({ theme }) => theme.color.fgOnAccent};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;
  &:hover {
    background: ${({ theme }) => theme.color.indigo[700]};
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
  @media (pointer: coarse) {
    height: 44px;
  }
`;
