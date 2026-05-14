import styled from 'styled-components';

export const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.color.ink[50]};
  display: grid;
  place-items: center;
  padding: ${({ theme }) => theme.space[6]};
  font-family: ${({ theme }) => theme.font.sans};
`;

export const Card = styled.div`
  width: 100%;
  max-width: 440px;
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  padding: ${({ theme }) => theme.space[8]};
  text-align: center;
`;

export const Title = styled.h1`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h3};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  margin: 0;
  letter-spacing: -0.01em;
`;

export const Body = styled.p`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[3]};
  margin: ${({ theme }) => theme.space[3]} 0 0;
  line-height: 1.6;
`;

export { Spinner } from '@/components/shared/Spinner';

export const MailtoLink = styled.a`
  display: inline-block;
  margin-top: ${({ theme }) => theme.space[3]};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.indigo[600]};
  text-decoration: none;
`;

/**
 * Item 1 — recoverable-error retry. Rendered for `rate-limit` + `generic`
 * states where the signer can usefully reload the link without involving
 * support. Mirrors the `Start signing` primary button pattern from
 * `SigningPrepPage` (theme.color.ink[900] background, theme.radius.md).
 */
export const TryAgainBtn = styled.button`
  margin-top: ${({ theme }) => theme.space[5]};
  width: 100%;
  height: 44px;
  border: none;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.ink[900]};
  color: ${({ theme }) => theme.color.paper};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;
