import styled from 'styled-components';

export const Root = styled.div`
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.color.bg.app};
  font-family: ${({ theme }) => theme.font.sans};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Header = styled.header`
  position: sticky;
  top: 0;
  z-index: ${({ theme }) => theme.z.sticky};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  min-height: 56px;
  padding: ${({ theme }) => `0 ${theme.space[3]}`};
  padding-top: env(safe-area-inset-top);
  background: ${({ theme }) => theme.color.paper};
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
`;

export const IconButton = styled.button`
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.bg.sunken};
  color: ${({ theme }) => theme.color.fg[1]};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.indigo[500]};
    outline-offset: 2px;
  }
`;

export const HeaderText = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
`;

export const HeaderTitle = styled.h1`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.body};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const HeaderSub = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const Body = styled.div`
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};
  padding: ${({ theme }) => `${theme.space[4]} ${theme.space[4]} ${theme.space[6]}`};
  touch-action: pan-y;

  @media (min-width: 960px) {
    display: grid;
    grid-template-columns: 220px minmax(0, 560px) 96px;
    justify-content: center;
    align-items: start;
    column-gap: ${({ theme }) => theme.space[8]};
  }
`;

export const LegendPanel = styled.aside`
  width: 100%;
  box-sizing: border-box;
  padding: ${({ theme }) => theme.space[4]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.paper};

  @media (min-width: 960px) {
    position: sticky;
    top: 72px;
  }
`;

export const PanelTitle = styled.h2`
  margin: 0 0 ${({ theme }) => theme.space[3]};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: ${({ theme }) => theme.font.tracking.wide};
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const PageArea = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  overflow-x: auto;
`;

export const RailSlot = styled.div`
  display: none;

  @media (min-width: 960px) {
    display: block;
    position: sticky;
    top: 72px;
  }
`;

export const SummaryPanel = styled.section`
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
  padding: ${({ theme }) => theme.space[5]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  background: ${({ theme }) => theme.color.paper};
`;

export const SummaryTitle = styled.h2`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h4};
  font-weight: ${({ theme }) => theme.font.weight.medium};
`;

export const SheetActions = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
  margin-top: ${({ theme }) => theme.space[4]};
`;

export const Notice = styled.div`
  margin: ${({ theme }) => `${theme.space[3]} ${theme.space[4]} 0`};
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[4]}`};
  border: 1px solid ${({ theme }) => theme.color.warn[500]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.warn[50]};
  color: ${({ theme }) => theme.color.warn[700]};
  font-size: ${({ theme }) => theme.font.size.bodySm};
`;

/**
 * Sticky bottom stack: the notice (a failed Approve, "sign in again") sits
 * directly above the action bar, so it is on screen where the owner tapped.
 * In normal flow it landed under the tall page, out of view on a phone.
 */
export const Footer = styled.div`
  position: sticky;
  bottom: 0;
  z-index: ${({ theme }) => theme.z.sticky};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
  background: ${({ theme }) => theme.color.paper};
`;

export const Bar = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[4]}`};
  padding-bottom: calc(${({ theme }) => theme.space[3]} + env(safe-area-inset-bottom));
  background: ${({ theme }) => theme.color.paper};
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
`;

export const BarSpacer = styled.div`
  flex: 1 1 auto;
`;
