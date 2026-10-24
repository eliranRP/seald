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

/** Desktop: bar, count, note in a row. Mobile: a 104px column, count on top. */
export const Progress = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  min-width: 0;
  flex: 1;

  @media (max-width: 640px) {
    flex: none;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    width: 104px;
  }
`;

export const Track = styled.div`
  width: 200px;

  @media (max-width: 640px) {
    width: auto;
  }
`;

export const Count = styled.span`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  line-height: 1;
  color: ${({ theme }) => theme.color.fg[1]};
  white-space: nowrap;

  @media (max-width: 640px) {
    order: -1;
    font-size: ${({ theme }) => theme.font.size.caption};
    line-height: ${({ theme }) => theme.font.lineHeight.normal};
  }
`;

export const Note = styled.span<{ readonly $required?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
  white-space: nowrap;

  @media (max-width: 640px) {
    display: ${({ $required }) => ($required ? 'none' : 'inline-flex')};
    font-size: ${({ theme }) => theme.font.size.xs};
  }
`;

/** The one primary action; it takes the rest of the row on mobile. */
export const Action = styled.div`
  flex: none;

  @media (max-width: 640px) {
    flex: 1;
    min-width: 0;
  }
`;
