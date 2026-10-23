import styled, { css } from 'styled-components';
import { rise } from '@/styles/motion';
import type { StatePageTone } from './StatePage.types';

export const Root = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};
  max-width: 440px;
  margin: 0 auto;
  padding: 96px ${({ theme }) => theme.space[6]};
  text-align: center;
  font-family: ${({ theme }) => theme.font.sans};
  ${rise}

  @media (max-width: 640px) {
    padding: 64px ${({ theme }) => theme.space[4]};
  }
`;

export const Code = styled.div`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.code};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  line-height: 1;
  letter-spacing: -0.02em;
  color: ${({ theme }) => theme.color.ink[200]};

  @media (max-width: 640px) {
    font-size: ${({ theme }) => theme.font.size.x5l};
  }
`;

const TONES: Record<StatePageTone, ReturnType<typeof css>> = {
  neutral: css`
    background: ${({ theme }) => theme.color.bg.subtle};
    color: ${({ theme }) => theme.color.fg[2]};
  `,
  bad: css`
    background: ${({ theme }) => theme.color.danger[50]};
    color: ${({ theme }) => theme.color.danger[700]};
  `,
  warn: css`
    background: ${({ theme }) => theme.color.warn[50]};
    color: ${({ theme }) => theme.color.warn[700]};
  `,
  ok: css`
    background: ${({ theme }) => theme.color.success[50]};
    color: ${({ theme }) => theme.color.success[700]};
  `,
};

export const IconCircle = styled.div<{ $tone: StatePageTone }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  ${({ $tone }) => TONES[$tone]}
`;

export const Title = styled.h1`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.x3l};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Description = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Body = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  width: 100%;
`;
