import styled, { type DefaultTheme } from 'styled-components';
import { rise } from '@/styles/motion';
import type { BannerTone } from './Banner.types';

const toneColors = (t: DefaultTheme, tone: BannerTone) =>
  ({
    info: { bg: t.color.indigo[50], fg: t.color.indigo[800], border: t.color.indigo[200] },
    ok: { bg: t.color.success[50], fg: t.color.success[700], border: t.color.success[200] },
    error: { bg: t.color.danger[50], fg: t.color.danger[700], border: t.color.danger[200] },
  })[tone];

export const BannerRoot = styled.div<{ $tone: BannerTone }>`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme, $tone }) => toneColors(theme, $tone).border};
  background: ${({ theme, $tone }) => toneColors(theme, $tone).bg};
  color: ${({ theme, $tone }) => toneColors(theme, $tone).fg};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  line-height: 1.4;
  ${rise}
  animation-duration: ${({ theme }) => theme.motion.durBase};
`;

export const BannerIcon = styled.span`
  display: inline-flex;
  flex: none;
  margin-top: 1px;
`;

export const BannerBody = styled.div`
  flex: 1;
  min-width: 0;
`;

export const BannerAction = styled.div`
  flex: none;
  margin: -4px -4px -4px 0;
`;
