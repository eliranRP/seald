import styled from 'styled-components';
import { fadeIn, sheetUp } from '@/styles/motion';

export const SheetBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 55;
  background: rgba(11, 18, 32, 0.32);
  display: flex;
  align-items: flex-end;
  ${fadeIn}
`;

export const SheetSurface = styled.div`
  background: ${({ theme }) => theme.color.paper};
  width: 100%;
  border-top-left-radius: ${({ theme }) => theme.radius.xl};
  border-top-right-radius: ${({ theme }) => theme.radius.xl};
  padding: 8px 16px calc(24px + env(safe-area-inset-bottom));
  box-shadow: ${({ theme }) => theme.shadow.xl};
  max-height: 88dvh;
  overflow-y: auto;
  ${sheetUp}
`;

export const SheetGrabber = styled.div`
  width: 36px;
  height: 4px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.ink[300]};
  margin: 4px auto 12px;
`;

export const SheetTitle = styled.div`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.xl};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  letter-spacing: -0.01em;
  margin-bottom: 14px;
`;
