import styled from 'styled-components';
import { sheetUp } from '@/styles/motion';

/** Fixed bottom bar: progress and the one primary action (canvas `.sign-bar`). */
export const Bar = styled.div`
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: ${({ theme }) => theme.z.sticky};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};
  height: 72px;
  padding: 0 ${({ theme }) => theme.space[6]};
  padding-bottom: env(safe-area-inset-bottom, 0px);
  box-sizing: content-box;
  background: ${({ theme }) => theme.color.paper};
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  box-shadow: 0 -4px 16px rgba(15, 23, 42, 0.06);
  ${sheetUp}

  @media (max-width: 640px) {
    padding-left: ${({ theme }) => theme.space[4]};
    padding-right: ${({ theme }) => theme.space[4]};
  }
`;

export const Progress = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  min-width: 0;
  flex: 1;
`;

export const Track = styled.div`
  width: 200px;

  @media (max-width: 640px) {
    display: none;
  }
`;

export const Count = styled.span`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  white-space: nowrap;
`;

export const Note = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
  white-space: nowrap;
`;
