import styled, { keyframes } from 'styled-components';

// Bottom-up sheet entry — mirrors the existing slide-up feel of the
// MWBottomSheet but for a full-viewport picker. No new tokens.
const slideUp = keyframes`
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
`;

export const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(11, 18, 32, 0.45);
  display: flex;
  align-items: stretch;
  justify-content: stretch;
`;

export const Surface = styled.div`
  background: #fff;
  width: 100%;
  display: flex;
  flex-direction: column;
  animation: ${slideUp} 220ms ease-out;
  /* Use 100dvh to honour iOS Safari's URL bar; fall back to vh on older
     browsers via the supplemental rule below. */
  height: 100vh;
  height: 100dvh;
`;

export const Header = styled.div`
  display: flex;
  align-items: center;
  height: 56px;
  padding: 0 8px;
  border-bottom: 1px solid var(--border-1);
  flex-shrink: 0;
`;

export const HeaderTitle = styled.h1`
  flex: 1;
  text-align: center;
  font: inherit;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 17px;
  font-weight: 500;
  color: var(--fg-1);
  margin: 0;
  /* Truncate long folder names (mobile is <414 px viewport) so the
     title can never push the close-button off-screen. */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 8px;
`;

export const IconButton = styled.button`
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 0;
  border-radius: 12px;
  cursor: pointer;
  color: var(--fg-2);
  flex-shrink: 0;

  &:active {
    background: var(--ink-100);
  }
  &:focus-visible {
    outline: 2px solid var(--indigo-600);
    outline-offset: 2px;
  }
`;

export const ScrollList = styled.div`
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
`;

export const Row = styled.button`
  width: 100%;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  min-height: 56px;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--border-1);
  cursor: pointer;
  font: inherit;
  color: var(--fg-1);

  &:active {
    background: var(--ink-100);
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  &:focus-visible {
    outline: 2px solid var(--indigo-600);
    outline-offset: -2px;
  }
`;

export const RowIcon = styled.span`
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: var(--ink-100);
  color: var(--indigo-600);
  flex-shrink: 0;
`;

export const RowText = styled.span`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
`;

export const RowTitle = styled.span`
  font-size: 15px;
  font-weight: 500;
  color: var(--fg-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const RowSub = styled.span`
  font-size: 12px;
  color: var(--fg-3);
  margin-top: 2px;
`;

export const Empty = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: var(--fg-3);
  font-size: 14px;
  gap: 12px;
  text-align: center;
`;

export const StateText = styled.div`
  color: var(--fg-2);
  font-size: 14px;
  line-height: 1.45;
`;

export const StateTitle = styled.div`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 18px;
  color: var(--fg-1);
`;

export const PrimaryAction = styled.button`
  margin-top: 8px;
  min-height: 44px;
  padding: 0 18px;
  border-radius: 12px;
  background: var(--indigo-600);
  color: #fff;
  border: 0;
  font: inherit;
  font-weight: 500;
  cursor: pointer;

  &:active {
    background: var(--indigo-700, #4338ca);
  }
  &:focus-visible {
    outline: 2px solid var(--indigo-600);
    outline-offset: 2px;
  }
`;

export const Skeleton = styled.div`
  height: 56px;
  margin: 0 16px;
  border-bottom: 1px solid var(--border-1);
  display: flex;
  align-items: center;
  gap: 12px;

  &::before {
    content: '';
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: var(--ink-100);
  }
  &::after {
    content: '';
    flex: 1;
    height: 12px;
    border-radius: 6px;
    background: var(--ink-100);
    margin-right: 24%;
  }
`;

export const ImportingOverlay = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.96);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  text-align: center;
  z-index: 1;
`;

export const Spinner = styled.div`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid var(--ink-200);
  border-top-color: var(--indigo-600);
  animation: spin 0.8s linear infinite;
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;
