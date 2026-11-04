import styled from 'styled-components';
import { pressable } from '@/styles/motion';

export const MobileNavRoot = styled.nav`
  flex: none;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  align-items: center;
  height: calc(80px + env(safe-area-inset-bottom));
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
  background: ${({ theme }) => theme.color.paper};
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  z-index: ${({ theme }) => theme.z.nav};
`;

export const MobileNavLink = styled.a`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 48px;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.micro};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[3]};
  text-decoration: none;
  transition: color ${({ theme }) => theme.motion.durFast}
    ${({ theme }) => theme.motion.easeStandard};
  &[aria-current='page'] {
    color: ${({ theme }) => theme.color.indigo[600]};
  }
  &:focus-visible {
    outline: 0;
    box-shadow: ${({ theme }) => theme.shadow.focus};
    border-radius: ${({ theme }) => theme.radius.sm};
  }
`;

export const MobileNavNew = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  margin: -16px auto 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: ${({ theme }) => theme.color.indigo[600]};
  color: ${({ theme }) => theme.color.fgOnAccent};
  box-shadow: ${({ theme }) => theme.shadow.md};
  cursor: pointer;
  ${pressable}
  &:hover {
    background: ${({ theme }) => theme.color.indigo[700]};
  }
  &:focus-visible {
    outline: 0;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }

  /* One primary per screen (hierarchy § 1): while the page shows its own
     primary action (an empty state's "Choose file", marked
     [data-page-primary]) or the host asks for it, the FAB goes calm:
     paper fill with an indigo glyph, so the accent stays on the page. */
  &[data-calm='true'],
  body:has([data-page-primary]) & {
    background: ${({ theme }) => theme.color.paper};
    color: ${({ theme }) => theme.color.indigo[600]};
    border: 1px solid ${({ theme }) => theme.color.border[1]};
  }
  &[data-calm='true']:hover,
  body:has([data-page-primary]) &:hover {
    background: ${({ theme }) => theme.color.indigo[50]};
  }
`;
