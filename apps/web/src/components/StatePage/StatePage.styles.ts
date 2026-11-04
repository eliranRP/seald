import styled, { css } from 'styled-components';
import { rise } from '@/styles/motion';
import type { StatePageTone } from './StatePage.types';

export const Root = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  /* 8px inside the title + description group; the icon / code and the
     actions add their own margin so the groups separate (hierarchy § 5). */
  gap: ${({ theme }) => theme.space[2]};
  box-sizing: border-box;
  width: 100%;
  max-width: 440px;
  margin: 0 auto;
  padding: 96px ${({ theme }) => theme.space[6]};
  text-align: center;
  font-family: ${({ theme }) => theme.font.sans};
  ${rise}

  /* Phone: full width, 64 / 16 / 24 (SystemMobile .state-page). */
  @media (max-width: 640px) {
    max-width: none;
    padding: 64px ${({ theme }) => theme.space[4]} ${({ theme }) => theme.space[6]};
  }
`;

export const Code = styled.div`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.code};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  line-height: 1;
  letter-spacing: -0.02em;
  color: ${({ theme }) => theme.color.ink[200]};
  margin-bottom: ${({ theme }) => theme.space[2]};
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
  margin-bottom: ${({ theme }) => theme.space[2]};
  border-radius: 50%;
  ${({ $tone }) => TONES[$tone]}
`;

/** `.h1.h1-m`: 28px serif, 1.1 line height, tight tracking. */
export const Title = styled.h1`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.x3l};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  line-height: ${({ theme }) => theme.font.lineHeight.tight};
  letter-spacing: ${({ theme }) => theme.font.tracking.tight};
  color: ${({ theme }) => theme.color.fg[1]};
`;

/** The page's only explanation: 14px UI body, not a 13px caption. */
export const Description = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Body = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};
  width: 100%;
  margin-top: ${({ theme }) => theme.space[4]};
`;
