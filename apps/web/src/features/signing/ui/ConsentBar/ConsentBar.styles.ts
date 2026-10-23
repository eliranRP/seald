import styled from 'styled-components';
import { rise } from '@/styles/motion';

/** Consent bar above the first page (canvas `.consent-bar`). */
export const Bar = styled.section`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};
  width: 100%;
  max-width: 880px;
  box-sizing: border-box;
  padding: 14px 16px 14px 20px;
  border: 1px solid ${({ theme }) => theme.color.indigo[200]};
  border-radius: ${({ theme }) => theme.radius.lg};
  background: ${({ theme }) => theme.color.paper};
  box-shadow: ${({ theme }) => theme.shadow.sm};
  ${rise}

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: stretch;
    padding: ${({ theme }) => theme.space[4]};
  }
`;

export const Who = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  min-width: 0;
  flex: 1 1 240px;
`;

export const WhoText = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

export const Asked = styled.span`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Meta = styled.span`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Agree = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  flex: 2 1 320px;
  min-width: 0;
`;

export const DisclosureLink = styled.a`
  flex-shrink: 0;
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.indigo[700]};
`;

export const ErrorLine = styled.p`
  flex-basis: 100%;
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.danger[700]};
`;
