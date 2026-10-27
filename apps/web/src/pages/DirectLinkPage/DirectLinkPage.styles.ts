import styled from 'styled-components';

/** Full-height column: the shared logo bar, then the card area. */
export const Screen = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.color.ink[50]};
  font-family: ${({ theme }) => theme.font.sans};
`;

export const Page = styled.main`
  flex: 1;
  display: grid;
  place-items: center;
  padding: ${({ theme }) => theme.space[4]};

  /* Phone: the card starts under the header instead of floating mid-screen. */
  @media (max-width: 640px) {
    align-items: start;
    padding-top: ${({ theme }) => theme.space[6]};
  }
`;

export const Card = styled.div`
  width: 100%;
  max-width: 440px;
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  padding: ${({ theme }) => theme.space[8]};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[6]};
  min-width: 0;

  @media (max-width: 640px) {
    padding: ${({ theme }) => theme.space[6]};
  }
`;

/** Title and its description read as one group: 8px inside, 24px to the form. */
export const Intro = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
`;

export const Title = styled.h1`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h3};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  letter-spacing: -0.01em;
  overflow-wrap: anywhere;
`;

export const Body = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[3]};
  line-height: 1.6;
`;

export const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
`;

export const FormError = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.danger[700]};
`;
