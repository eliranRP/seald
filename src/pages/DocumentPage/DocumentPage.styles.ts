import styled from 'styled-components';

export const Shell = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: ${({ theme }) => theme.color.bg.app};
  font-family: ${({ theme }) => theme.font.sans};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Body = styled.div`
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
`;

export const Workspace = styled.div`
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  background: ${({ theme }) => theme.color.ink[50]};
  user-select: none;
`;

export const Center = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
  padding: ${({ theme }) => theme.space[6]} 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};
`;

export const CenterHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  max-width: 780px;
  padding: 0 ${({ theme }) => theme.space[6]};
`;

export const CenterHeaderSide = styled.div`
  min-width: 68px;
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
`;

export const RightRailInner = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

export const RightRailScroll = styled.div`
  flex: 1 1 auto;
  overflow: auto;
  padding: ${({ theme }) => theme.space[4]};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
`;

export const RightRailFooter = styled.div`
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
`;

export const CanvasWrap = styled.div`
  position: relative;
`;
