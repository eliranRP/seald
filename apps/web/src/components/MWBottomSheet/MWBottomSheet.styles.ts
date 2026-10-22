import styled from 'styled-components';

export const SheetBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 55;
  background: rgba(11, 18, 32, 0.45);
  display: flex;
  align-items: flex-end;
`;

export const SheetSurface = styled.div`
  background: ${({ theme }) => theme.color.paper};
  width: 100%;
  border-top-left-radius: 24px;
  border-top-right-radius: 24px;
  padding: 10px 16px calc(28px + env(safe-area-inset-bottom));
  box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.15);
  max-height: 88dvh;
  overflow-y: auto;
`;

export const SheetGrabber = styled.div`
  width: 36px;
  height: 5px;
  border-radius: 3px;
  background: var(--ink-200);
  margin: 4px auto 12px;
`;

export const SheetTitle = styled.div`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 20px;
  font-weight: 500;
  color: var(--fg-1);
  letter-spacing: -0.01em;
  margin-bottom: 14px;
`;
