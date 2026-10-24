import styled from 'styled-components';
import { rise, spring } from '@/styles/motion';
import type { StatusTone } from './StatusPage.types';

export const Page = styled.div`
  min-height: 100vh;
  min-height: 100dvh;
  background: ${({ theme }) => theme.color.bg.surface};
`;

/** Centred status column (canvas `.state-page`). */
export const Column = styled.main`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};
  max-width: 440px;
  margin: 0 auto;
  padding: 96px ${({ theme }) => theme.space[6]};
  text-align: center;
  ${rise}

  @media (max-width: 640px) {
    padding-top: ${({ theme }) => theme.space[16]};
  }
`;

export const Disc = styled.span<{ readonly $tone: StatusTone }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  ${spring}
  background: ${({ theme, $tone }) => {
    if ($tone === 'success' || $tone === 'ok') return theme.color.success[50];
    if ($tone === 'bad') return theme.color.danger[50];
    if ($tone === 'warn') return theme.color.warn[50];
    return theme.color.bg.subtle;
  }};
  color: ${({ theme, $tone }) => {
    if ($tone === 'success' || $tone === 'ok') return theme.color.success[700];
    if ($tone === 'bad') return theme.color.danger[700];
    if ($tone === 'warn') return theme.color.warn[700];
    return theme.color.fg[2];
  }};
`;

export const Title = styled.h1`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.x3l};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  letter-spacing: -0.01em;
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Body = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};
  width: 100%;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[3]};
`;

/** Anchor that looks like the secondary button: a real link target (download). */
export const ActionLink = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space[2]};
  height: 44px;
  padding: 0 ${({ theme }) => theme.space[5]};
  border: 1px solid ${({ theme }) => theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.paper};
  color: ${({ theme }) => theme.color.fg[1]};
  font-size: ${({ theme }) => theme.font.size.bodyMd};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  text-decoration: none;

  &:hover {
    background: ${({ theme }) => theme.color.bg.subtle};
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

/** Quiet inline link under the actions. */
export const TextLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.indigo[700]};
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

export const Quote = styled.blockquote`
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  padding: 10px 14px;
  border-left: 3px solid ${({ theme }) => theme.color.danger[500]};
  border-radius: 0 ${({ theme }) => theme.radius.sm} ${({ theme }) => theme.radius.sm} 0;
  background: ${({ theme }) => theme.color.paper};
  text-align: left;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const Fine = styled.div`
  width: 100%;
  font-size: ${({ theme }) => theme.font.size.micro};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  color: ${({ theme }) => theme.color.fg[3]};
  text-align: left;
`;
