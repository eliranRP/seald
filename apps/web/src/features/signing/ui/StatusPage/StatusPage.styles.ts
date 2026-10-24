import styled from 'styled-components';
import { rise, spring } from '@/styles/motion';
import type { StatusTone } from './StatusPage.types';

export const Page = styled.div`
  min-height: 100vh;
  min-height: 100dvh;
  background: ${({ theme }) => theme.color.bg.app};

  @media (max-width: 640px) {
    background: ${({ theme }) => theme.color.bg.subtle};
  }
`;

/**
 * Status column (canvas `.state-page`): centred in the space under the 64px
 * header on desktop; top-aligned under the 56px header on mobile (16px page
 * gutter + 40px top padding).
 */
export const Column = styled.main`
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space[4]};
  max-width: 440px;
  min-height: calc(100vh - 64px);
  min-height: calc(100dvh - 64px);
  margin: 0 auto;
  padding: ${({ theme }) => `${theme.space[6]} ${theme.space[6]}`};
  text-align: center;
  ${rise}

  @media (max-width: 640px) {
    justify-content: flex-start;
    min-height: 0;
    padding: 56px ${({ theme }) => theme.space[6]} ${({ theme }) => theme.space[10]};
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

/**
 * Canvas `.h1` (32px) on desktop, `.h1-m` (28px) on mobile. While busy
 * ("Opening …") it is the quiet `.body` line under the spinner instead.
 */
export const Title = styled.h1<{ readonly $busy: boolean }>`
  margin: 0;
  font-family: ${({ theme, $busy }) => ($busy ? theme.font.sans : theme.font.serif)};
  font-size: ${({ theme, $busy }) => ($busy ? theme.font.size.bodyMd : theme.font.size.x4l)};
  font-weight: ${({ theme, $busy }) =>
    $busy ? theme.font.weight.regular : theme.font.weight.medium};
  line-height: ${({ theme, $busy }) =>
    $busy ? theme.font.lineHeight.normal : theme.font.lineHeight.tight};
  letter-spacing: ${({ theme, $busy }) =>
    $busy ? theme.font.tracking.normal : theme.font.tracking.tight};
  color: ${({ theme, $busy }) => ($busy ? theme.color.fg[2] : theme.color.fg[1])};

  @media (max-width: 640px) {
    font-size: ${({ theme, $busy }) => ($busy ? theme.font.size.caption : theme.font.size.x3l)};
  }
`;

export const Body = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};
  width: 100%;
  font-size: ${({ theme }) => theme.font.size.caption};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  color: ${({ theme }) => theme.color.fg[3]};
`;

/** Anchor that looks like the secondary button: a real link target (download). */
export const ActionLink = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space[2]};
  height: 44px;
  padding: 0 18px;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.paper};
  color: ${({ theme }) => theme.color.fg[1]};
  font-size: ${({ theme }) => theme.font.size.bodySm};
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
  justify-content: center;
  gap: 6px;
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
