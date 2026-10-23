import { NavLink } from 'react-router-dom';
import styled from 'styled-components';
import { Button } from '@/components/Button';
import { rise } from '@/styles/motion';
import type { SealdTheme } from '@/styles/theme';

const MOBILE = '@media (max-width: 640px)';

export const Page = styled.div`
  width: 100%;
  max-width: 1040px;
  margin: 0 auto;
  padding: ${({ theme }) => `${theme.space[8]} ${theme.space[6]} ${theme.space[20]}`};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[6]};

  ${MOBILE} {
    padding: ${({ theme }) => `${theme.space[4]} ${theme.space[4]} ${theme.space[20]}`};
    gap: ${({ theme }) => theme.space[4]};
  }
`;

export const PageTitle = styled.h1`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.x4l};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};

  ${MOBILE} {
    display: none;
  }
`;

export const Layout = styled.div`
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: ${({ theme }) => theme.space[10]};
  align-items: start;

  ${MOBILE} {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const SideNav = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: sticky;
  top: ${({ theme }) => theme.space[6]};

  ${MOBILE} {
    display: none;
  }
`;

export const NavDivider = styled.hr`
  width: 100%;
  margin: ${({ theme }) => `${theme.space[2]} 0`};
  border: 0;
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
`;

export const SideLink = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: 10px;
  height: 40px;
  padding: 0 ${({ theme }) => theme.space[3]};
  border-radius: ${({ theme }) => theme.radius.md};
  color: ${({ theme }) => theme.color.fg[2]};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  text-decoration: none;
  transition:
    background-color ${({ theme }) => theme.motion.durFast}
      ${({ theme }) => theme.motion.easeStandard},
    color ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard};

  &:hover {
    background: ${({ theme }) => theme.color.bg.subtle};
    color: ${({ theme }) => theme.color.fg[1]};
  }

  &.active {
    background: ${({ theme }) => theme.color.indigo[50]};
    color: ${({ theme }) => theme.color.indigo[800]};
    font-weight: ${({ theme }) => theme.font.weight.semibold};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.indigo[500]};
    outline-offset: 2px;
  }
`;

export const MobileTop = styled.div`
  display: none;

  ${MOBILE} {
    display: flex;
    align-items: center;
    gap: ${({ theme }) => theme.space[3]};
  }
`;

export const MobileTitle = styled.h1`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.xl};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
  min-width: 0;
  ${rise}
`;

export const Panel = styled.div<{ $gap?: keyof SealdTheme['space'] }>`
  display: flex;
  flex-direction: column;
  gap: ${({ theme, $gap = 6 }) => theme.space[$gap]};
  padding: ${({ theme }) => theme.space[6]};
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
`;

export const RowsCard = styled.div`
  padding: 4px ${({ theme }) => theme.space[5]};
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
`;

export const Eyebrow = styled.span<{ $danger?: boolean }>`
  font-size: ${({ theme }) => theme.font.size.xs};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: ${({ theme }) => theme.font.tracking.wider};
  text-transform: uppercase;
  color: ${({ theme, $danger }) => ($danger ? theme.color.danger[700] : theme.color.fg[3])};
`;

export const Meta = styled.span`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Row = styled.div<{ $last?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  min-height: 60px;
  border-bottom: ${({ theme, $last }) => ($last ? '0' : `1px solid ${theme.color.ink[150]}`)};

  ${MOBILE} {
    flex-wrap: wrap;
    padding: ${({ theme }) => `${theme.space[3]} 0`};
  }
`;

export const RowIcon = styled.span<{ $danger?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: ${({ theme, $danger }) => ($danger ? theme.color.danger[50] : theme.color.ink[100])};
  color: ${({ theme, $danger }) => ($danger ? theme.color.danger[700] : theme.color.fg[2])};
`;

export const RowLabel = styled.span<{ $danger?: boolean }>`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme, $danger }) => ($danger ? theme.color.danger[700] : theme.color.fg[1])};
`;

export const Spacer = styled.span`
  flex: 1;
`;

export const InlineRow = styled.div<{ $gap?: number }>`
  display: flex;
  align-items: center;
  gap: ${({ $gap = 12 }) => `${$gap}px`};
  min-width: 0;
`;

export const Stack = styled.div<{ $gap?: number }>`
  display: flex;
  flex-direction: column;
  gap: ${({ $gap = 8 }) => `${$gap}px`};
  min-width: 0;
`;

export const NameInput = styled.input`
  width: 100%;
  height: 44px;
  padding: 0 ${({ theme }) => theme.space[3]};
  border: 1px solid ${({ theme }) => theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.paper};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.body};
  color: ${({ theme }) => theme.color.fg[1]};

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.color.border.focus};
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const FieldError = styled.span`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.danger[700]};
`;

export const SigPad = styled.div<{ $small?: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: ${({ $small }) => ($small ? '200px' : '100%')};
  height: ${({ $small }) => ($small ? '72px' : '160px')};
  overflow: hidden;
  background: ${({ theme }) => theme.color.paper};
  border: 1px dashed ${({ theme }) => theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.md};
`;

export const SigInk = styled.span<{ $small?: boolean }>`
  font-family: ${({ theme }) => theme.font.script};
  font-size: ${({ theme, $small }) => ($small ? theme.font.size.x4l : theme.font.size.x5l)};
  color: ${({ theme }) => theme.color.ink[900]};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
`;

export const SigImage = styled.img`
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
`;

export const SigCanvas = styled.canvas`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: crosshair;
`;

export const PadAction = styled.div`
  position: absolute;
  top: ${({ theme }) => theme.space[2]};
  right: ${({ theme }) => theme.space[2]};
`;

export const HiddenFile = styled.input`
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
`;

export const DropLabel = styled.label`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space[2]};
  width: 100%;
  height: 100%;
  cursor: pointer;
  color: ${({ theme }) => theme.color.fg[2]};
  text-align: center;

  &:focus-within {
    outline: 2px solid ${({ theme }) => theme.color.indigo[500]};
    outline-offset: -2px;
  }
`;

export const DirtyBar = styled.div`
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: ${({ theme }) => theme.z.sticky};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  min-height: 72px;
  padding: 0 ${({ theme }) => theme.space[12]};
  background: ${({ theme }) => theme.color.paper};
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  box-shadow: ${({ theme }) => theme.shadow.md};

  ${MOBILE} {
    padding: 0 ${({ theme }) => theme.space[4]};
    padding-bottom: env(safe-area-inset-bottom);
  }
`;

export const IntegrationCard = styled.div<{ $stack?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
  padding: ${({ theme }) => theme.space[5]};
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  ${rise}
`;

export const IntegrationHead = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};

  ${MOBILE} {
    flex-wrap: wrap;
  }
`;

export const IntegrationLogo = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 48px;
  height: 48px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.bg.subtle};
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const CardTitle = styled.div`
  font-size: ${({ theme }) => theme.font.size.xl};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const AccountLine = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  padding-top: ${({ theme }) => theme.space[4]};
  border-top: 1px solid ${({ theme }) => theme.color.ink[150]};

  ${MOBILE} {
    flex-wrap: wrap;
  }
`;

export const AccountEmail = styled.div`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  overflow-wrap: anywhere;
`;

export const Grow = styled.div`
  flex: 1;
  min-width: 0;
`;

export const IndexList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
`;

export const IndexLink = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  min-height: 56px;
  padding: 0 ${({ theme }) => theme.space[4]};
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  color: ${({ theme }) => theme.color.fg[1]};
  font-size: ${({ theme }) => theme.font.size.body};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  text-decoration: none;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.indigo[500]};
    outline-offset: 2px;
  }
`;

export const Lock = styled.span`
  display: inline-flex;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const DialogIconBubble = styled.span<{ $bad?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: ${({ theme, $bad }) => ($bad ? theme.color.danger[50] : theme.color.bg.subtle)};
  color: ${({ theme, $bad }) => ($bad ? theme.color.danger[700] : theme.color.fg[2])};
`;

export const DialogCenter = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  text-align: center;
`;

export const DangerButton = styled(Button)`
  && {
    color: ${({ theme }) => theme.color.danger[700]};
  }
`;
