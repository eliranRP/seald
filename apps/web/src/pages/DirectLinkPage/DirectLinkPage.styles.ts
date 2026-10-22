import styled from 'styled-components';

export const Page = styled.main`
  min-height: 100vh;
  background: ${({ theme }) => theme.color.ink[50]};
  display: grid;
  place-items: center;
  padding: ${({ theme }) => theme.space[4]};
  font-family: ${({ theme }) => theme.font.sans};
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
  gap: ${({ theme }) => theme.space[4]};
  min-width: 0;
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
