import styled from 'styled-components';
import { pop } from '@/styles/motion';

export const Card = styled.div`
  width: 300px;
  max-width: calc(100vw - 32px);
  padding: ${({ theme }) => theme.space[2]} 0;
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  box-shadow: ${({ theme }) => theme.shadow.lg};
  ${pop}
`;

export const Head = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => `0 ${theme.space[3]} ${theme.space[1]} ${theme.space[4]}`};
`;

export const Title = styled.h2`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.xs};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: ${({ theme }) => theme.font.tracking.wider};
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const List = styled.dl`
  margin: 0;
`;

export const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => `6px ${theme.space[4]}`};
`;

export const Action = styled.dt`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const Keys = styled.dd`
  display: inline-flex;
  gap: 4px;
  margin: 0;
`;

export const Kbd = styled.kbd`
  min-width: 22px;
  padding: 2px 6px;
  text-align: center;
  border-radius: ${({ theme }) => theme.radius.xxs};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  background: ${({ theme }) => theme.color.ink[50]};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.fg[1]};
`;
