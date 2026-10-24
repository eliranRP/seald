import styled from 'styled-components';
import { rise } from '@/styles/motion';

export const Root = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space[3]};
  padding: 56px ${({ theme }) => theme.space[6]};
  text-align: center;
  font-family: ${({ theme }) => theme.font.sans};
  ${rise}
`;

export const Art = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: ${({ theme }) => theme.color.indigo[50]};
  color: ${({ theme }) => theme.color.indigo[600]};
`;

export const Title = styled.h2`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  font-size: ${({ theme }) => theme.font.size.x2l};
  line-height: ${({ theme }) => theme.font.lineHeight.snug};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Text = styled.div`
  max-width: 320px;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Action = styled.div`
  margin-top: ${({ theme }) => theme.space[1]};
`;
