import styled from 'styled-components';

/** The whole signing screen: pages on a subtle ground, bar fixed below. */
export const Page = styled.div`
  min-height: 100vh;
  min-height: 100dvh;
  background: ${({ theme }) => theme.color.bg.subtle};
  font-family: ${({ theme }) => theme.font.sans};
`;

/** Scrolling column of pages (canvas `.sign-stage`). */
export const Stage = styled.main`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[6]};
  padding: ${({ theme }) => `${theme.space[8]} ${theme.space[6]} 120px`};

  @media (max-width: 640px) {
    gap: ${({ theme }) => theme.space[3]};
    padding: ${({ theme }) => `${theme.space[4]} ${theme.space[4]} 96px`};
  }
`;

export const Pages = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[6]};
  width: 100%;
`;

export const ErrorSlot = styled.div`
  width: 100%;
  max-width: 880px;
`;
