import styled from 'styled-components';
import { fadeIn, pop, sheetUp } from '@/styles/motion';

/**
 * Modal on desktop (canvas `.modal`), bottom sheet at 640px and below
 * (canvas `.sheet`). One component so every signer dialog behaves the same
 * at both widths.
 */
export const Scrim = styled.div`
  position: fixed;
  inset: 0;
  z-index: ${({ theme }) => theme.z.modal};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.space[5]};
  background: rgba(11, 18, 32, 0.32);
  ${fadeIn}

  @media (max-width: 640px) {
    align-items: flex-end;
    padding: 0;
  }
`;

export const Surface = styled.div<{ readonly $width: number }>`
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: ${({ $width }) => `${$width}px`};
  max-height: 88vh;
  overflow: hidden;
  background: ${({ theme }) => theme.color.paper};
  border-radius: ${({ theme }) => theme.radius.xl};
  box-shadow: ${({ theme }) => theme.shadow.xl};
  ${pop}

  /* Canvas \`.sheet\`: 8 16 24 padding around handle, head, body and foot. */
  @media (max-width: 640px) {
    max-width: none;
    max-height: 92dvh;
    border-radius: ${({ theme }) => `${theme.radius.xl} ${theme.radius.xl} 0 0`};
    padding: ${({ theme }) => `${theme.space[2]} ${theme.space[4]}`}
      calc(${({ theme }) => theme.space[6]} + env(safe-area-inset-bottom, 0px));
    ${sheetUp}
  }
`;

/** Canvas `.sheet-handle`; the bottom sheet only. */
export const Handle = styled.div`
  display: none;

  @media (max-width: 640px) {
    display: block;
    flex: none;
    width: 36px;
    height: 4px;
    margin: 4px auto 12px;
    border-radius: ${({ theme }) => theme.radius.pill};
    background: ${({ theme }) => theme.color.ink[300]};
  }
`;

export const Head = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => `${theme.space[5]} ${theme.space[6]}`};
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};

  @media (max-width: 640px) {
    padding: ${({ theme }) => `${theme.space[1]} ${theme.space[1]} ${theme.space[3]}`};
    border-bottom: 0;
  }
`;

export const Heading = styled.h2`
  flex: 1;
  min-width: 0;
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.x2l};
  line-height: ${({ theme }) => theme.font.lineHeight.snug};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
  flex: 1;
  min-height: 0;
  padding: ${({ theme }) => theme.space[6]};
  overflow: auto;

  @media (max-width: 640px) {
    gap: ${({ theme }) => theme.space[3]};
    padding: 0 0 ${({ theme }) => theme.space[2]};
  }
`;

export const Foot = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.space[2]};
  padding: ${({ theme }) => `${theme.space[4]} ${theme.space[6]}`};
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};

  @media (max-width: 640px) {
    padding: ${({ theme }) => theme.space[3]} 0 0;
    border-top: 0;
    & > * {
      flex: 1;
    }
  }
`;
